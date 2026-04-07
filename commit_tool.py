import os, sys, json
import urllib.request
import base64

token = os.environ.get("GITHUB_TOKEN")
if not token:
    # We don't have token in env
    pass
