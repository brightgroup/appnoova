#
# Noova 360 — Pipecat + Telnyx + Gemini Live (self-hosted)
#

import asyncio
import base64
import os
import time
from typing import Any

from dotenv import load_dotenv
from google.genai.types import ThinkingConfig
from loguru import logger
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.frames.frames import LLMRunFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineParams, PipelineWorker
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    AssistantTurnStoppedMessage,
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
    UserTurnStoppedMessage,
)
from pipecat.processors.audio.audio_buffer_processor import AudioBufferProcessor
from pipecat.runner.types import RunnerArguments
from pipecat.runner.utils import parse_telephony_websocket
from pipecat.serializers.telnyx import TelnyxFrameSerializer
from pipecat.services.google.gemini_live.llm import GeminiLiveLLMService
from pipecat.transports.base_transport import BaseTransport
from pipecat.transports.websocket.fastapi import (
    FastAPIWebsocketParams,
    FastAPIWebsocketTransport,
)
from pipecat.workers.runner import WorkerRunner

from audio_recorder import pcm_to_wav_bytes
from goodbye import is_goodbye_utterance
from noova_client import fetch_bridge_config, finalize_call, telnyx_hangup, update_phase

load_dotenv(override=True)

DEFAULT_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025"
HANGUP_DELAY_AGENT_SEC = 2.2
HANGUP_DELAY_USER_SEC = 2.8


def _google_api_key() -> str:
    key = (
        os.getenv("GOOGLE_API_KEY")
        or os.getenv("GOOGLE_AI_KEY")
        or os.getenv("NEXT_PUBLIC_GOOGLE_AI_KEY")
        or ""
    ).strip()
    if not key:
        raise RuntimeError("Falta GOOGLE_API_KEY / GOOGLE_AI_KEY")
    return key


async def run_bot(
    transport: BaseTransport,
    runner_args: RunnerArguments,
    call_control_id: str,
    agent_config: dict[str, Any],
):
    transcript: list[dict[str, Any]] = []
    session_start = time.time()
    model = agent_config.get("model") or DEFAULT_MODEL
    voice = agent_config.get("voice_name") or "Aoede"
    temperature = max(float(agent_config.get("temperature") or 1.0), 0.92)
    system_instruction = agent_config.get("system_instruction") or ""

    hangup_scheduled = False
    hangup_task: asyncio.Task | None = None
    finalized = False
    user_turn_count = 0
    recorded_pcm = b""
    audio_ready = asyncio.Event()

    audio_buffer = AudioBufferProcessor(sample_rate=8000, num_channels=1, buffer_size=0)

    logger.info(
        "Iniciando pipeline",
        call_control_id=call_control_id,
        agent=agent_config.get("agent_name"),
        model=model,
        voice=voice,
    )

    llm = GeminiLiveLLMService(
        api_key=_google_api_key(),
        settings=GeminiLiveLLMService.Settings(
            model=model,
            voice=voice,
            temperature=temperature,
            system_instruction=system_instruction,
            thinking=ThinkingConfig(thinking_budget=0),
            context_window_compression={"enabled": True},
        ),
    )

    kickoff = agent_config.get("kickoff_message") or (
        "La llamada acaba de conectarse. Saluda con UNA sola frase breve "
        "en español colombiano paisa y luego espera en silencio a que el usuario hable."
    )

    context = LLMContext(
        [
            {
                "role": "user",
                "content": kickoff,
            }
        ]
    )
    user_aggregator, assistant_aggregator = LLMContextAggregatorPair(
        context,
        user_params=LLMUserAggregatorParams(
            vad_analyzer=SileroVADAnalyzer(),
        ),
    )

    # Pipeline original que funcionaba + buffer de audio al final (no en medio del flujo).
    pipeline = Pipeline(
        [
            transport.input(),
            user_aggregator,
            llm,
            transport.output(),
            assistant_aggregator,
            audio_buffer,
        ]
    )

    worker = PipelineWorker(
        pipeline,
        params=PipelineParams(
            audio_in_sample_rate=8000,
            audio_out_sample_rate=8000,
            enable_metrics=True,
            enable_usage_metrics=True,
        ),
        idle_timeout_secs=runner_args.pipeline_idle_timeout_secs,
    )

    @audio_buffer.event_handler("on_audio_data")
    async def on_audio_data(buffer, audio: bytes, sample_rate: int, num_channels: int):
        nonlocal recorded_pcm
        if audio:
            recorded_pcm = audio
        audio_ready.set()

    async def do_finalize(disconnect_reason: str) -> None:
        nonlocal finalized
        if finalized:
            return
        finalized = True

        try:
            await audio_buffer.stop_recording()
            try:
                await asyncio.wait_for(audio_ready.wait(), timeout=2.0)
            except asyncio.TimeoutError:
                pass
        except Exception as e:
            logger.warning(f"No se pudo detener grabación: {e}")

        duration_sec = max(0, int(time.time() - session_start))
        wav_bytes = pcm_to_wav_bytes(recorded_pcm, sample_rate=8000)
        audio_b64 = base64.b64encode(wav_bytes).decode("ascii") if wav_bytes else None

        await finalize_call(
            call_control_id,
            transcript,
            disconnect_reason,
            duration_sec=duration_sec,
            audio_base64=audio_b64,
        )

    async def schedule_hangup(role: str) -> None:
        nonlocal hangup_scheduled, hangup_task
        if hangup_scheduled or finalized:
            return
        if len(transcript) < 2:
            return

        hangup_scheduled = True
        delay = HANGUP_DELAY_AGENT_SEC if role == "agent" else HANGUP_DELAY_USER_SEC
        logger.info(f"Despedida detectada ({role}) — colgando en {delay}s")

        async def _hangup_after_delay() -> None:
            await asyncio.sleep(delay)
            await update_phase(call_control_id, "ended")
            await telnyx_hangup(call_control_id)

        hangup_task = asyncio.create_task(_hangup_after_delay())

    def check_goodbye(role: str, text: str) -> None:
        if hangup_scheduled or finalized or len(transcript) < 2:
            return
        if is_goodbye_utterance(text):
            asyncio.create_task(schedule_hangup(role))

    @transport.event_handler("on_client_connected")
    async def on_client_connected(transport, client):
        logger.info("Telnyx conectado", call_control_id=call_control_id)
        await update_phase(call_control_id, "connected")
        await audio_buffer.start_recording()
        # Arranque de sesión Gemini Live (necesario para que el pipeline produzca audio).
        await asyncio.sleep(0.8)
        await worker.queue_frames([LLMRunFrame()])

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, client):
        nonlocal hangup_task
        logger.info("Telnyx desconectado", call_control_id=call_control_id)
        if hangup_task and not hangup_task.done():
            hangup_task.cancel()
        await do_finalize("Agent Hangup" if hangup_scheduled else "Phone Hangup")
        await worker.cancel()

    @user_aggregator.event_handler("on_user_turn_stopped")
    async def on_user_turn_stopped(aggregator, strategy, message: UserTurnStoppedMessage):
        nonlocal user_turn_count
        if not message.content:
            return
        user_turn_count += 1
        transcript.append(
            {
                "role": "user",
                "text": message.content,
                "time_sec": max(0, int(time.time() - session_start)),
            }
        )
        logger.info(f"user: {message.content}")
        await update_phase(call_control_id, "connected")
        if user_turn_count == 1:
            await worker.queue_frames([LLMRunFrame()])
        check_goodbye("user", message.content)

    @assistant_aggregator.event_handler("on_assistant_turn_stopped")
    async def on_assistant_turn_stopped(aggregator, message: AssistantTurnStoppedMessage):
        if not message.content:
            return
        transcript.append(
            {
                "role": "agent",
                "text": message.content,
                "time_sec": max(0, int(time.time() - session_start)),
            }
        )
        logger.info(f"agent: {message.content}")
        await update_phase(call_control_id, "speaking")
        check_goodbye("agent", message.content)

    runner = WorkerRunner(handle_sigint=runner_args.handle_sigint)
    await runner.add_workers(worker)
    await runner.run()


async def bot(runner_args: RunnerArguments):
    """Punto de entrada compatible con pipecat.runner.run."""
    _, call_data = await parse_telephony_websocket(runner_args.websocket)
    call_control_id = call_data["call_control_id"]

    logger.info(
        "Llamada Telnyx",
        call_control_id=call_control_id,
        from_number=call_data.get("from"),
        to_number=call_data.get("to"),
    )

    agent_config = await fetch_bridge_config(call_control_id)

    serializer = TelnyxFrameSerializer(
        stream_id=call_data["stream_id"],
        outbound_encoding=call_data.get("outbound_encoding") or "PCMU",
        inbound_encoding="PCMU",
        call_control_id=call_control_id,
        api_key=os.getenv("TELNYX_API_KEY"),
    )

    transport = FastAPIWebsocketTransport(
        websocket=runner_args.websocket,
        params=FastAPIWebsocketParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            add_wav_header=False,
            serializer=serializer,
        ),
    )

    await run_bot(
        transport,
        runner_args,
        call_control_id=call_control_id,
        agent_config=agent_config,
    )


if __name__ == "__main__":
    from pipecat.runner.run import main

    main()
