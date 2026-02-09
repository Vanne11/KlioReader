import { Mic, Square, Play, Pause, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n';

interface Props {
  isRecording: boolean;
  recordingTime: number;
  audioUrl: string | null;
  isPlaying: boolean;
  onStart: () => void;
  onStop: () => void;
  onDiscard: () => void;
  onPlay: () => void;
  onStopPlay: () => void;
  onUpload: () => void;
}

export function VoiceNoteRecorder({ isRecording, recordingTime, audioUrl, isPlaying, onStart, onStop, onDiscard, onPlay, onStopPlay, onUpload }: Props) {
  const { t } = useT();
  return (
    <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
      {!audioUrl ? (
        <>
          {isRecording ? (
            <>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 animate-pulse" onClick={onStop}><Square className="w-3.5 h-3.5" /></Button>
              <div className="flex-1 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-xs font-mono font-bold text-red-400">{recordingTime}s / 10s</span>
                <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-red-400 transition-all" style={{ width: `${(recordingTime / 10) * 100}%` }} />
                </div>
              </div>
            </>
          ) : (
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5 text-primary" onClick={onStart}>
              <Mic className="w-3.5 h-3.5" /> {t('voiceNote.voiceNote')}
            </Button>
          )}
        </>
      ) : (
        <>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={isPlaying ? onStopPlay : onPlay}>
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </Button>
          <span className="text-[10px] font-mono opacity-50">{recordingTime}s</span>
          <div className="flex-1" />
          <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400" onClick={onDiscard}><Trash2 className="w-3 h-3" /></Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-green-400" onClick={onUpload}><Upload className="w-3 h-3" /></Button>
        </>
      )}
    </div>
  );
}
