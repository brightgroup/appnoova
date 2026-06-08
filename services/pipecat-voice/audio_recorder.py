import audioop
import io
import wave

from pipecat.frames.frames import AudioRawFrame, Frame, InputAudioRawFrame
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor


class CallAudioTap(FrameProcessor):
    """Acumula PCM de un lado de la llamada."""

    def __init__(self):
        super().__init__()
        self._chunks: list[bytes] = []

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        if isinstance(frame, (AudioRawFrame, InputAudioRawFrame)) and frame.audio:
            self._chunks.append(bytes(frame.audio))
        await self.push_frame(frame, direction)

    def pcm_bytes(self) -> bytes:
        return b"".join(self._chunks)


def mix_pcm_mono(user_pcm: bytes, agent_pcm: bytes, sample_width: int = 2) -> bytes:
    if not user_pcm and not agent_pcm:
        return b""
    if not user_pcm:
        return agent_pcm
    if not agent_pcm:
        return user_pcm
    max_len = max(len(user_pcm), len(agent_pcm))
    user_pcm = user_pcm.ljust(max_len, b"\x00")
    agent_pcm = agent_pcm.ljust(max_len, b"\x00")
    return audioop.add(user_pcm, agent_pcm, sample_width)


def pcm_to_wav_bytes(pcm: bytes, sample_rate: int = 8000) -> bytes:
    if not pcm:
        return b""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm)
    return buf.getvalue()
