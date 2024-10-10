import React, { useState, useRef, useEffect } from 'react';
import './LandingPageForm.css';

const LandingPageForm: React.FC = () => {
  const [videoLink, setVideoLink] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [transformOption, setTransformOption] = useState('summarize');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<
  { title: string; duration: string; transcript: string; transformedTranscript: string; transformOptionUsed: string; activeTab: string }[]
>([]);

  const [activeTab, setActiveTab] = useState<'recordings' | 'realTime'>('recordings');
  const [isRecording, setIsRecording] = useState(false);
  const [realTimeTranscript, setRealTimeTranscript] = useState('');
  const [recordingTime, setRecordingTime] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const maxFileSizeInMB = 2500;
  const transcriptionType = 'openai-srt';

  const isFileSizeValid = (file: File, maxSizeInMB: number): boolean => {
    const maxSizeInBytes = maxSizeInMB * 1024 * 1024; 
    return file.size <= maxSizeInBytes;
  };
  
  const handleVideoLinkChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVideoLink(e.target.value);
    setError(null); 
    setFile(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];

      if (!isFileSizeValid(selectedFile, maxFileSizeInMB)) {
        setError(`File size exceeds ${maxFileSizeInMB} MB. Please upload a smaller file.`);
        setFile(null);
        return;
      }

      setFile(selectedFile);
      setError(null);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const selectedFile = e.dataTransfer.files[0];

      if (!isFileSizeValid(selectedFile, maxFileSizeInMB)) {
        setError(`File size exceeds ${maxFileSizeInMB} MB. Please upload a smaller file.`);
        setFile(null);
        return;
      }

      setFile(selectedFile);
      setError(null);
      setVideoLink('');
      e.dataTransfer.clearData();
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const serverUrl = process.env.REACT_APP_API_BASE_URL;

    let data: FormData | { url: string; transform: string; transcriptionType: string };

    if (file) {
      data = new FormData();
      data.append('file', file);
      data.append('transform', transformOption);
      data.append('transcriptionType', transcriptionType);

      try {
        const response = await fetch(`${serverUrl}/transcribe/file/demo`, {
          method: 'POST',
          body: data,
          credentials: 'include',
        });

        if (response.ok) {
          const { jobId } = await response.json();
          console.log('jobId', jobId);
          await pollJobStatus(jobId);
        } else {
          const error = await response.json();
          setError(error.error || response.statusText);
        }
      } catch (error) {
        setError('An error occurred while processing the request.');
      } finally {
        setLoading(false);
      }

    } else if (videoLink) {
      if (videoLink.includes('youtube.com') || videoLink.includes('youtu.be')) {
        data = {
          url: videoLink,
          transform: transformOption,
          transcriptionType: transcriptionType,
        };
      } else if (videoLink.includes('drive.google.com')) {
        const fileIdMatch = videoLink.match(/\/d\/(.*?)\//);
        const fileId = fileIdMatch ? fileIdMatch[1] : null;

        if (!fileId) {
          setError('Invalid Google Drive URL.');
          setLoading(false);
          return;
        }

        data = {
          url: `https://drive.google.com/uc?export=download&id=${fileId}`,
          transform: transformOption,
          transcriptionType: transcriptionType,
        };
      } else if (videoLink.includes('vimeo.com')) {
        const videoIdMatch = videoLink.match(/vimeo\.com\/(\d+)/);
        const videoId = videoIdMatch ? videoIdMatch[1] : null;

        if (!videoId) {
          setError('Invalid Vimeo URL.');
          setLoading(false);
          return;
        }

        data = {
          url: videoLink,
          transform: transformOption,
          transcriptionType: transcriptionType,
        };
      } else {
        setError('Unsupported URL. Please provide a valid YouTube, Google Drive, or Vimeo link.');
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`${serverUrl}/transcribe/link/demo`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
          credentials: 'include',
        });

        console.log('response', response);
        if (response.ok) {
          const { jobId } = await response.json();
          console.log('jobId', jobId);
          await pollJobStatus(jobId);
        } else {
          const error = await response.json();
          setError(error.error || response.statusText);
        }
      } catch (error) {
        setError('An error occurred while processing the request.');
      } finally {
        setLoading(false);
      }
    } else {
      setError('Please provide either a video link or upload a file.');
      setLoading(false);
    }
  };

  const pollJobStatus = async (jobId: string) => {
    const serverUrl = process.env.REACT_APP_API_BASE_URL;

    try {
      let jobStatus = 'pending';
      let result;

      while (jobStatus === 'pending') {
        const response = await fetch(`${serverUrl}/transcribe/status/${jobId}`, {
          method: 'GET',
          credentials: 'include',
        });

        if (response.ok) {
          result = await response.json();
          jobStatus = result.status;
        } else {
          const error = await response.json();
          setError(error.error || response.statusText);
          return;
        }

        if (jobStatus === 'pending') {
          await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for 5 seconds before polling again
        }
      }

      if (jobStatus === 'finished') {
        const structuredResult = {
          title: result.title,
          duration: result.duration,
          transcript: result.transcript,
          transformedTranscript: result.transformed_transcript,
          transformOptionUsed: transformOption,
          activeTab: transformOption !== 'none' ? 'transformed' : 'full',
        };

        setResults((prevResults) => [structuredResult, ...prevResults]);
      } else {
        setError('Job failed to complete.');
      }
    } catch (error) {
      setError('An error occurred while polling the job status.');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const closeTranscript = (index: number) => {
    setResults((prevResults) => prevResults.filter((_, i) => i !== index));
  };
  const formatDuration = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
  
    const timeString = [h, m, s]
      .map(unit => unit.toString().padStart(2, '0'))
      .join(':');
  
    if (h > 0) {
      return `${timeString} hours`;
    } else if (m > 0) {
      return `${timeString} minutes`;
    } else {
      return `${timeString} seconds`;
    }
  };

  const handleRecordingToggle = () => {
    if (isRecording) {
      clearInterval(timerRef.current!);
      timerRef.current = null;
    } else {
      setRecordingTime(0); // Reset timer when starting
      timerRef.current = setInterval(() => {
        setRecordingTime(prevTime => prevTime + 1);
      }, 1000);
    }
    setIsRecording(!isRecording);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  return (
    <div className="landing-page">
      <div className="marketing-copy-container">
        <div className="marketing-copy">
          <h1>Unlock Insights</h1>
          <div className="tab-content">
            <p>
            <strong>Unlock the power of transcription.</strong> Effortlessly capture and understand key information from lectures, meetings, and more. Options to <strong>summarize</strong>, <strong>highlight key points</strong>, or <strong>format for readability</strong> allow you to digest hours of content in minutes. Perfect for <strong>professionals</strong>, <strong>students</strong>, and <strong>parents</strong> looking to maximize the value of their time.
            </p>
          </div>
        </div>
        <div className="tab-label-container">
          <label className="tab-label">Select Option:</label>
        </div>
        <div className="tab-buttons">
          <button
            className={`tab-button ${activeTab === 'recordings' ? 'active' : ''}`}
            onClick={() => setActiveTab('recordings')}
          >
            Recordings
          </button>
          <button
            className={`tab-button ${activeTab === 'realTime' ? 'active' : ''}`}
            onClick={() => setActiveTab('realTime')}
          >
            Real-Time
          </button>
        </div>
      </div>
      <div className="form-container">
        {activeTab === 'recordings' ? (
          <form onSubmit={handleSubmit}>
            {/* Existing form for recordings */}
            <div
              className="file-upload-container"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
            >
              <input
                type="file"
                id="file-upload"
                accept="video/*"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              <label htmlFor="file-upload" className="file-upload-label">
                <div className="file-dropzone">
                  {file ? (
                    <span>{file.name}</span>
                  ) : (
                    <>
                      <span>Upload file</span>
                      <p>Click to browse or drag & drop a file here</p>
                    </>
                  )}
                </div>
              </label>
            </div>

            <label htmlFor="video-link">Paste a video link from YouTube, Google Drive, or Vimeo</label>
            <input
              type="text"
              id="video-link"
              value={videoLink}
              onChange={handleVideoLinkChange}
              placeholder="Paste YouTube, Google Drive, or Vimeo link here"
            />

            <label htmlFor="transform-option">Enhancement</label>
            <select
              id="transform-option"
              value={transformOption}
              onChange={(e) => setTransformOption(e.target.value)}
            >
              <option value="none">None</option>
              <option value="summarize">Summarize</option>
              <option value="formatting">Format for Readability</option>
              <option value="removefillerwords">Remove Filler Words</option>
              <option value="paragraphs">Make Paragraphs</option>
              <option value="keywords">Keyword Extraction</option>
              <option value="youtubehighlights">YouTube Highlights</option>
              <option value="youtubesummary">YouTube Summary</option>
            </select>

            <button type="submit" className="submit-button" disabled={loading}>
              {loading ? <div className="spinner"></div> : 'Transcribe'}
            </button>
          </form>
        ) : (
          <div className="real-time-form">
            <button onClick={handleRecordingToggle} className="record-button">
              {isRecording ? 'Stop Recording' : 'Start Recording'}
            </button>
            <div className="timer">Recording Time: {recordingTime}s</div>
            <textarea
              value={realTimeTranscript}
              readOnly
              placeholder="Real-time transcription will appear here..."
              className="transcription-area"
            />
          </div>
        )}
        {results.map((result, index) => (
          <div key={index} className="transcription-result">
            <button className="close-button" onClick={() => closeTranscript(index)}>X</button>
            <h3>#{results.length - index}</h3>
            <h4>Title: {result.title}</h4>
            <p>Duration: {formatDuration(parseInt(result.duration, 10))}</p>
            <div className="transcription-tabs">
              {result.transformOptionUsed !== 'none' && (
                <button
                  className={`tab-button ${result.activeTab === 'transformed' ? 'active' : ''}`}
                  onClick={() => setResults(prevResults => {
                    const updatedResults = [...prevResults];
                    updatedResults[index].activeTab = 'transformed';
                    return updatedResults;
                  })}
                >
                  Transformed ({result.transformOptionUsed})
                </button>
              )}
              <button
                className={`tab-button ${result.activeTab === 'full' ? 'active' : ''}`}
                onClick={() => setResults(prevResults => {
                  const updatedResults = [...prevResults];
                  updatedResults[index].activeTab = 'full';
                  return updatedResults;
                })}
              >
                Full Transcript
              </button>
            </div>
            <div className="transcript-content">
              {result.activeTab === 'transformed' && result.transformOptionUsed !== 'none' ? (
                <pre>{result.transformedTranscript}</pre>
              ) : (
                <pre>{result.transcript}</pre>
              )}
            </div>
            <button
              className="copy-button"
              onClick={() =>
                copyToClipboard(result.activeTab === 'transformed' && result.transformOptionUsed !== 'none' ? result.transformedTranscript : result.transcript)
              }
            >
              Copy
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LandingPageForm;