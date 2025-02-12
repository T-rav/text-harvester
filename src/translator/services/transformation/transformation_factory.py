import os

from .formatting import FormattingForReadabilityTransformation
from .keywords import FormattingForKeywordsTransformation
from .paragraphs import FormattingForParagraphsTransformation
from .removefillerwords import FormattingForFillerWordsTransformation
from .youtubehighlights import FormattingForYoutubeHighlightsTransformation
from .youtubesummary import FormattingForYoutubeSummaryTransformation
from .none import NoneTransformation
from .summarize import SummarizeTransformation
from .transformation_service import TransformationService
from enums.transcription_transformation import TranscriptionTransformation

class TransformationFactory:
    _service_map = {
        TranscriptionTransformation.NONE: (NoneTransformation, None, None),
        TranscriptionTransformation.SUMMARIZE: (SummarizeTransformation, "OPENAI_API_KEY", "LANGCHAIN_API_KEY"),
        TranscriptionTransformation.FORMATTING: (FormattingForReadabilityTransformation, "OPENAI_API_KEY", "LANGCHAIN_API_KEY"),
        TranscriptionTransformation.PARAGRAPHS: (FormattingForParagraphsTransformation, "OPENAI_API_KEY", "LANGCHAIN_API_KEY"),
        TranscriptionTransformation.REMOVEFILLERWORDS: (FormattingForFillerWordsTransformation, "OPENAI_API_KEY", "LANGCHAIN_API_KEY"),
        TranscriptionTransformation.KEYWORDS: (FormattingForKeywordsTransformation, "OPENAI_API_KEY", "LANGCHAIN_API_KEY"),
        TranscriptionTransformation.YOUTUBEHIGHLIGHTS : (FormattingForYoutubeHighlightsTransformation, "OPENAI_API_KEY", "LANGCHAIN_API_KEY"),
        TranscriptionTransformation.YOUTUBESUMMARY : (FormattingForYoutubeSummaryTransformation, "OPENAI_API_KEY", "LANGCHAIN_API_KEY"),
    }

    @staticmethod
    def get_transformation_service(service_name: TranscriptionTransformation) -> TransformationService:
        if service_name not in TransformationFactory._service_map:
            raise ValueError(f"Unsupported transcription service: {service_name}")

        service_class, *api_key_envs = TransformationFactory._service_map[service_name]
        api_keys = [os.getenv(key) for key in api_key_envs if key]
        if any(key is None for key in api_keys):
            missing_keys = [key for key, value in zip(api_key_envs, api_keys) if value is None]
            raise ValueError(f"API keys missing: {', '.join(missing_keys)}")

        return service_class(*api_keys)

