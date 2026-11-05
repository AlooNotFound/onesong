import path from 'path';
import { fileURLToPath, fileUrlToPath } from 'url';

const __fname = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__fname);

export const AUDIO_ROOT = path.resolve(__dirname, '../../data/audio');
export const INCOMING_DIR = path.join(AUDIO_ROOT, 'incoming');
export const CACHE_DIR = path.join(AUDIO_ROOT, 'cache');

export const TCACHE_SIZE = 10;
export const MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1GB

export const ALLOWED_AUDIO_EXTS = ['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac', '.opus'];
export const AUDIO_MIME_TYPES = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.opus': 'audio/opus',
};