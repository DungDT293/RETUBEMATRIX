"""Proxy reputation providers."""
from .base import ProviderResult
from .http import PROVIDER_CHECKS

__all__ = ["ProviderResult", "PROVIDER_CHECKS"]
