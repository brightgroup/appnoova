#
# Noova 360 — Pipecat + Telnyx + Gemini Live (self-hosted)
#

import asyncio
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

from noova_client import fetch_bridge_config, finalize_call, update_phase

load_dotenv(override=True)

DEFAULT_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025"


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
    temperature = float(agent_config.get("temperature") or 1.0)
    system_instruction = agent_config.get("system_instruction") or ""

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

    context = LLMContext()
    user_aggregator, assistant_aggregator = LLMContextAggregatorPair(
        context,
        user_params=LLMUserAggregatorParams(
            vad_analyzer=SileroVADAnalyzer(),
        ),
    )

    pipeline = Pipeline(
        [
            transport.input(),
            user_aggregator,
            llm,
            transport.output(),
            assistant_aggregator,
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

    @transport.event_handler("on_client_connected")
    async def on_client_connected(transport, client):
        logger.info("Telnyx conectado", call_control_id=call_control_id)
        await update_phase(call_control_id, "connected")
        # Esperar a que el pipeline y Gemini Live estén listos antes del saludo.
        await asyncio.sleep(0.8)
        await worker.queue_frames([LLMRunFrame()])

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, client):
        logger.info("Telnyx desconectado", call_control_id=call_control_id)
        duration_sec = max(0, int(time.time() - session_start))
        await finalize_call(
            call_control_id,
            transcript,
            "Phone Hangup",
            duration_sec=duration_sec,
        )
        await worker.cancel()

    @user_aggregator.event_handler("on_user_turn_stopped")
    async def on_user_turn_stopped(aggregator, strategy, message: UserTurnStoppedMessage):
        if not message.content:
            return
        transcript.append(
            {
                "role": "user",
                "text": message.content,
                "time_sec": max(0, int(time.time() - session_start)),
            }
        )
        logger.info(f"user: {message.content}")
        await update_phase(call_control_id, "connected")

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
