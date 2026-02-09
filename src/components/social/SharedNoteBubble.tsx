import { User, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SharedNote } from '@/types';
import * as api from '@/lib/api';
import { useRef, useState } from 'react';
import { useT } from '@/i18n';

interface Props {
  note: SharedNote;
}

export function SharedNoteBubble({ note }: Props) {
  const { t } = useT();
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playAudio = () => {
    if (playing && audioRef.current) {
      audioRef.current.pause();
      setPlaying(false);
      return;
    }
    const audio = new Audio(api.getVoiceNoteAudioUrl(note.id));
    audioRef.current = audio;
    audio.onended = () => setPlaying(false);
    audio.play();
    setPlaying(true);
  };

  return (
    <div className="rounded-lg px-3 py-2 bg-cyan-500/10 border-l-3 border-cyan-400/50" style={{ borderLeftWidth: '3px', borderLeftColor: note.color || 'rgb(34 211 238 / 0.5)' }}>
      <div className="flex items-center gap-1.5 mb-1">
        <div className="w-4 h-4 rounded-full bg-cyan-400/20 flex items-center justify-center">
          <User className="w-2.5 h-2.5 text-cyan-400" />
        </div>
        <span className="text-[9px] font-bold text-cyan-400">{note.username}</span>
      </div>
      {note.highlight_text && <p className="text-[10px] italic opacity-50 mb-1">"{note.highlight_text}"</p>}
      {note.content && <p className="text-xs">{note.content}</p>}
      {note.has_audio && (
        <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1 mt-1 px-2" onClick={playAudio}>
          <Volume2 className={`w-3 h-3 ${playing ? 'text-cyan-400 animate-pulse' : ''}`} />
          {playing ? t('sharedNote.playing') : `${note.audio_duration || '?'}s`}
        </Button>
      )}
    </div>
  );
}
