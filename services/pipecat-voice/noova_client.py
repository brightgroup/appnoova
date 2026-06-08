import os
from typing import Any

import httpx
from loguru import logger

DEFAULT_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025"


def _app_base_url() -> str:
    return os.getenv("NOOVA_APP_URL", "http://localhost:8000").rstrip("/")


def _internal_headers() -> dict[str, str]:
    secret = os.getenv("PIPECAT_INTERNAL_SECRET", "").strip()
    if not secret:
        raise RuntimeError("PIPECAT_INTERNAL_SECRET no configurado")
    return {"Authorization": f"Bearer {secret}"}


async def fetch_bridge_config(call_control_id: str) -> dict[str, Any]:
    url = f"{_app_base_url()}/api/telephony/bridge-config"
    async with httpx.AsyncClient(timeout=10.0) as client:
        res = await client.get(
            url,
            params={"call_control_id": call_control_id},
            headers=_internal_headers(),
        )
        res.raise_for_status()
        data = res.json()
        return {
            "call_control_id": data.get("call_control_id", call_control_id),
            "call_record_id": data.get("call_record_id", ""),
            "agent_name": data.get("agent_name", "Agente"),
            "model": data.get("model") or DEFAULT_MODEL,
            "voice_name": data.get("voice_name") or "Aoede",
            "temperature": float(data.get("temperature") or 1.0),
            "system_instruction": data.get("system_instruction") or "",
        }


async def update_phase(call_control_id: str, phase: str) -> None:
    url = f"{_app_base_url()}/api/telephony/pipecat/phase"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(
                url,
                json={"call_control_id": call_control_id, "phase": phase},
                headers=_internal_headers(),
            )
    except Exception as e:
        logger.warning(f"No se pudo actualizar fase ({phase}): {e}")


async def telnyx_hangup(call_control_id: str) -> None:
    api_key = os.getenv("TELNYX_API_KEY", "").strip()
    if not api_key:
        logger.warning("TELNYX_API_KEY no configurado — no se puede colgar")
        return
    url = f"https://api.telnyx.com/v2/calls/{call_control_id}/actions/hangup"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.post(
                url,
                headers={"Authorization": f"Bearer {api_key}"},
            )
            if res.status_code >= 400:
                logger.warning(f"Telnyx hangup {res.status_code}: {res.text}")
            else:
                logger.info(f"Colgada llamada {call_control_id}")
    except Exception as e:
        logger.warning(f"Error colgando llamada {call_control_id}: {e}")


async def finalize_call(
    call_control_id: str,
    transcript: list[dict[str, Any]],
    disconnect_reason: str,
    duration_sec: int | None = None,
    audio_base64: str | None = None,
    audio_mime: str = "audio/wav",
) -> None:
    url = f"{_app_base_url()}/api/telephony/pipecat/finalize"
    payload: dict[str, Any] = {
        "call_control_id": call_control_id,
        "transcript": transcript,
        "disconnect_reason": disconnect_reason,
    }
    if duration_sec is not None:
        payload["duration_sec"] = duration_sec
    if audio_base64:
        payload["audio_base64"] = audio_base64
        payload["audio_mime"] = audio_mime

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            res = await client.post(url, json=payload, headers=_internal_headers())
            res.raise_for_status()
            logger.info(f"Finalizada llamada {call_control_id}")
    except Exception as e:
        logger.error(f"Error finalizando llamada {call_control_id}: {e}")
