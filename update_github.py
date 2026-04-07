import urllib.request, json, os, base64

token = os.environ.get("GITHUB_TOKEN")
if not token:
    raise ValueError("Missing GITHUB_TOKEN")

api_url = "https://api.github.com/repos/fabianotetracomunicacao/louvor-api/contents/lp-api-main/api.py"

req = urllib.request.Request(api_url, headers={"Authorization": f"token {token}", "Accept": "application/vnd.github.v3+json"})
resp = urllib.request.urlopen(req)
sha = json.loads(resp.read())["sha"]

with open("api.py", "rb") as f:
    content = base64.b64encode(f.read()).decode('utf-8')

payload = {
    "message": "Enhance gospel genre detection & prevent redirects",
    "content": content,
    "sha": sha,
    "branch": "main"
}

req_put = urllib.request.Request(api_url, data=json.dumps(payload).encode(), headers={"Authorization": f"token {token}", "Accept": "application/vnd.github.v3+json"}, method="PUT")
resp_put = urllib.request.urlopen(req_put)
print(resp_put.status)
