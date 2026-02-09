import { useState, useRef, useCallback } from 'react';
import * as api from '@/lib/api';
import { useNotesStore } from '@/stores/notesStore';
import { useUIStore } from '@/stores/uiStore';

export function useVoiceNotes() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { setReaderNotes } = useNotesStore();
  const { showAlert } = useUIStore();

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1 } });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 16000 });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach(t => t.stop());
      };

      mediaRecorderRef.current = recorder;
      recorder.start(100);
      setIsRecording(true);
      setRecordingTime(0);
      setAudioBlob(null);
      setAudioUrl(null);

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= 10) {
            stopRecording();
            return 10;
          }
          return prev + 1;
        });
      }, 1000);
    } catch {
      showAlert('error', 'Error', 'No se pudo acceder al micrófono');
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
  }, []);

  const discardRecording = useCallback(() => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingTime(0);
  }, [audioUrl]);

  const playPreview = useCallback(() => {
    if (!audioUrl) return;
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    audio.onended = () => setIsPlaying(false);
    audio.play();
    setIsPlaying(true);
  }, [audioUrl]);

  const stopPreview = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  async function uploadVoice(bookId: number, chapterIndex: number, content?: string) {
    if (!audioBlob) return;
    try {
      const res = await api.uploadVoiceNote(bookId, audioBlob, {
        chapter_index: chapterIndex,
        duration: recordingTime,
        content,
      });
      setReaderNotes(prev => [...prev, {
        id: res.id,
        book_id: bookId,
        chapter_index: chapterIndex,
        content: content || '',
        highlight_text: null,
        color: '#ffeb3b',
        is_shared: 0,
        audio_path: 'voice',
        audio_duration: res.audio_duration,
        created_at: new Date().toISOString(),
      }]);
      discardRecording();
      showAlert('success', 'Nota de voz', 'Nota de voz guardada');
    } catch (err: any) {
      showAlert('error', 'Error', err.message || 'No se pudo subir la nota de voz');
    }
  }

  return {
    isRecording, recordingTime, audioBlob, audioUrl, isPlaying,
    startRecording, stopRecording, discardRecording, playPreview, stopPreview, uploadVoice,
  };
}
