import json
import subprocess
import os
import re
import argparse
from enum import Enum
from abc import ABC, abstractmethod
from dotenv import load_dotenv
from openai import OpenAI
from groq import Groq
from pydub import AudioSegment
from typing import List, Optional, Iterator

# Load environment variables from .env file
load_dotenv()

class TranscriptionServiceType(Enum):
    OPENAI = "openai"
    OPENAI_VTT = "openai-vtt"
    OPENAI_SRT = "openai-srt"
    GROQ = "groq"

class TranscriptionService(ABC):
    @abstractmethod
    def transcribe(self, audio_file_path: str, prompt: str) -> str:
        pass
    def file_name_extension(self) -> str:
        pass

class OpenAITranscriptionService(TranscriptionService):
    def __init__(self, api_key: str):
        self.client = OpenAI(api_key=api_key)

    def transcribe(self, audio_file_path: str, prompt: str) -> str:
        with open(audio_file_path, 'rb') as audio_file:
            print(f"Processing part {audio_file_path}")
            transcription = self.client.audio.transcriptions.create(model="whisper-1", file=audio_file, prompt=prompt)
        return transcription.text

    def file_name_extension(self) -> str:
        return ".txt"
    
class OpenAIVttTranscriptionService(TranscriptionService):
    def __init__(self, api_key: str):
        self.client = OpenAI(api_key=api_key)

    def transcribe(self, audio_file_path: str, prompt: str) -> str:
        with open(audio_file_path, 'rb') as audio_file:
            print(f"Processing part {audio_file_path}")
            transcription = self.client.audio.transcriptions.create(model="whisper-1", file=audio_file, response_format="vtt", prompt=prompt)
        return transcription.replace("WEBVTT\n\n", "")

    def file_name_extension(self) -> str:
        return ".vtt"

class OpenAISrtTranscriptionService(TranscriptionService):
    def __init__(self, api_key: str):
        self.client = OpenAI(api_key=api_key)

    def transcribe(self, audio_file_path: str, prompt: str) -> str:
        with open(audio_file_path, 'rb') as audio_file:
            print(f"Processing part {audio_file_path}")
            transcription = self.client.audio.transcriptions.create(model="whisper-1", file=audio_file, response_format="srt", prompt=prompt)
        return transcription

    def file_name_extension(self) -> str:
        return ".srt"
    
class GroqTranscriptionService(TranscriptionService):
    def __init__(self, api_key: str):
        self.client = Groq(api_key=api_key)

    def transcribe(self, audio_file_path: str, prompt: str) -> str:
        with open(audio_file_path, 'rb') as audio_file:
            print(f"Processing part {audio_file_path}")
            trimmed_prompt = self.take_last_896_chars(prompt)
            transcription = self.client.audio.transcriptions.create(model="whisper-large-v3", file=audio_file)
        return transcription.text

    def file_name_extension(self) -> str:
        return ".txt"

    # limit the prompt to 896 characters
    def take_last_896_chars(self, input_string):
        if len(input_string) > 896:
            return input_string[-896:]
        else:
            return input_string

class TranscriptionFactory:
    # add services here
    _service_map = {
        TranscriptionServiceType.OPENAI: (OpenAITranscriptionService, "OPENAI_API_KEY"),
        TranscriptionServiceType.OPENAI_SRT: (OpenAISrtTranscriptionService, "OPENAI_API_KEY"),
        TranscriptionServiceType.OPENAI_VTT: (OpenAIVttTranscriptionService, "OPENAI_API_KEY"),
        TranscriptionServiceType.GROQ: (GroqTranscriptionService, "GROQ_API_KEY")
    }

    @staticmethod
    def get_transcription_service(service_name: TranscriptionServiceType) -> TranscriptionService:
        if service_name not in TranscriptionFactory._service_map:
            raise ValueError(f"Unsupported transcription service: {service_name}")

        service_class, api_key_env = TranscriptionFactory._service_map[service_name]
        api_key = os.getenv(api_key_env)
        if api_key is None:
            raise ValueError(f"{api_key_env} is not provided")

        return service_class(api_key)

def get_video_info(url: str) -> dict:
    command = [
        'yt-dlp',
        '--dump-json',
        url
    ]
    result = subprocess.run(command, check=True, capture_output=True, text=True)
    video_info = result.stdout
    return json.loads(video_info)

def download_audio(url: str, path: str, max_length_minutes: Optional[int] = None) -> Optional[str]:
    # Ensure the path exists
    if not os.path.exists(path):
        os.makedirs(path)

    command = [
        'yt-dlp',
        '-x',  # Extract audio
        '--audio-format', 'm4a',  # Specify audio format
        '--output', os.path.join(path, '%(title)s.%(ext)s'),  # Naming convention
        '--format', 'bestaudio',
        '-N', '4', # use 4 connections
        url  # YouTube URL
    ]

    try:
        # Execute the yt-dlp command
        result = subprocess.run(command, check=True, capture_output=True, text=True)
        # Extract the file path from the stdout
        output = result.stdout
        file_path_match = re.search(r'Destination:\s+(.*\.m4a)', output)
        
        if file_path_match:
            file_path = file_path_match.group(1).strip()
            if os.path.exists(file_path) and file_path.endswith(".m4a"):
                # If max_length_minutes is set, trim the audio
                if max_length_minutes:
                    print(f"Trimming audio file: {file_path}")
                    max_length_seconds = max_length_minutes * 60
                    trimmed_file_path = file_path.replace('.m4a', '_trimmed.m4a')
                    subprocess.run(['ffmpeg', '-i', file_path, '-ss', '00:00:00', '-t', str(max_length_seconds), trimmed_file_path], check=True)
                    os.remove(file_path)  # Remove the original untrimmed file
                    return trimmed_file_path
                return file_path
    except subprocess.CalledProcessError as e:
        print(f"Error: {e.stderr}")
    
    return None  # In case no file is found

def split_audio(file_path: str, segment_length_ms: int = 600000) -> Iterator[str]:  # Default segment length: 10 minutes
    song = AudioSegment.from_file(file_path)
    parts = len(song) // segment_length_ms + 1
    base, ext = os.path.splitext(file_path)
    audio_format = ext.replace('.', '')

    for i in range(parts):
        start = i * segment_length_ms
        part = song[start:start + segment_length_ms]
        part_file_path = f"{base}_part{i}{ext}"
        if audio_format == 'm4a':
            part.export(part_file_path, format='ipod')  # Use 'ipod' codec for m4a
        else:
            part.export(part_file_path, format=audio_format)
        yield part_file_path

def transcribe_audio_segment(service: TranscriptionService, audio_file_path: str, prompt: str) -> str:
    return service.transcribe(audio_file_path, prompt)

def transcribe_audio(file_path: str, service: TranscriptionService, prompt: str) -> str:
    # Check file size first
    if os.path.getsize(file_path) > 26214400:  # If file is larger than 25MB
        transcriptions: List[str] = []
        system_prompt = prompt
        for segment_path in split_audio(file_path):
            transcription = transcribe_audio_segment(service, segment_path, system_prompt)
            # need to inject last segment into the prompt, last 224 tokens are respected
            system_prompt = f"{transcription} {prompt}"
            transcriptions.append(transcription)
            os.remove(segment_path)  # Clean up the segment
        return ' '.join(transcriptions)
    else:
        return transcribe_audio_segment(service, file_path, prompt)

if __name__ == "__main__":
    # Command line arguments
    parser = argparse.ArgumentParser(description='Transcribe audio from a video or local file.')
    parser.add_argument('url', type=str, help='The URL of the video or path to the local file.')
    parser.add_argument('--path', type=str, default='./incoming', help='The directory path to save the audio file.')
    parser.add_argument('--max_length_minutes', type=int, default=None, help='Maximum length of the video in minutes.')
    parser.add_argument('--prompt', type=str, default=None, help='Prompt for the transcription service.')
    parser.add_argument('--service', type=str, choices=[service.value for service in TranscriptionServiceType], default='openai-srt', help='The transcription service to use.')

    args = parser.parse_args()

    print("Processing audio...")
    if args.url.startswith("https://"):
        audio_file_path = download_audio(args.url, f'{args.path}/audio', max_length_minutes=args.max_length_minutes)
    else:
        # assume it is a local file
        file_name = os.path.basename(args.url)
        audio_file_path = os.path.join(args.path, "audio", file_name)

        # Check the file extension and only convert if it's not already .m4a or .mp3
        if not (file_name.endswith(".m4a") or file_name.endswith(".mp3")):
            print("Fetching audio...")
            # Replace spaces with hyphens in the file name if not .m4a or .mp3
            file_name = file_name.replace(" ", "-")
            audio_file_path = os.path.join(args.path, "audio", os.path.splitext(file_name)[0] + "_audio.m4a")
            
            # Ensure the directory exists
            os.makedirs(os.path.dirname(audio_file_path), exist_ok=True)
            
            # Convert the file to M4A format
            subprocess.run(['ffmpeg', '-i', args.url, '-vn', '-ar', '16000', '-ac', '1', '-ab', '128k', '-f', 'ipod', audio_file_path], check=True)

    print(f"Audio file is ready at {audio_file_path}")

    # Transcription part
    if audio_file_path is not None:
        print(f"Running transcription on {audio_file_path}")
        transcription_service = TranscriptionFactory.get_transcription_service(TranscriptionServiceType(args.service)) 
        combined_transcription = transcribe_audio(audio_file_path, transcription_service, args.prompt)
        
        # Derive the transcription file path by replacing the audio file extension with '_transcript.txt'
        transcription_file_path = f'{os.path.splitext(audio_file_path)[0]}_transcript{transcription_service.file_name_extension()}'.replace("audio/", "transcript/")
        
        # Ensure the directory exists
        os.makedirs(os.path.dirname(transcription_file_path), exist_ok=True)
        
        # Writing the transcription to the file
        with open(transcription_file_path, 'w', encoding='utf-8') as file:
            file.write(combined_transcription)

        print(f"Transcription written to {transcription_file_path}")

    # python3 app.py "https://youtu.be/ZLXHyOIIM0o" --path "./incoming"  --prompt "My name is Travis Frisinger. I am a software engineer who blogs, streams and pod cast about my AI Adventures with Gen AI." --service "openai-srt"
    # --max_length_minutes 10