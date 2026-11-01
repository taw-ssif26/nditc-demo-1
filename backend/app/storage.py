"""Where uploaded files live. Local disk by default (VPS); S3-compatible bucket when S3_BUCKET is set (Supabase Storage, R2, B2...)."""
import os, pathlib, shutil
from urllib.parse import quote
from fastapi import HTTPException
from fastapi.responses import FileResponse, StreamingResponse


def _cd(name, inline): return f"{'inline' if inline else 'attachment'}; filename*=UTF-8''{quote(name)}"


class Disk:
    def __init__(self, root):
        self.root = pathlib.Path(root)
        for d in ("pub", "priv"): (self.root / d).mkdir(parents=True, exist_ok=True)

    def _p(self, public, name): return self.root / ("pub" if public else "priv") / name
    def put(self, public, name, fobj, mime):
        with open(self._p(public, name), "wb") as o: shutil.copyfileobj(fobj, o)
    def delete(self, public, name): self._p(public, name).unlink(missing_ok=True)
    def send(self, public, name, filename, mime, inline, cache):
        p = self._p(public, name)
        if not p.exists(): raise HTTPException(404, "Not found")
        return FileResponse(p, media_type=mime, filename=filename, content_disposition_type="inline" if inline else "attachment", headers={"Cache-Control": cache})


class S3:
    def __init__(self):
        import boto3
        from botocore.config import Config
        try: cfg = Config(s3={"addressing_style": "path"}, signature_version="s3v4", request_checksum_calculation="when_required", response_checksum_validation="when_required")
        except TypeError: cfg = Config(s3={"addressing_style": "path"}, signature_version="s3v4")  # older botocore
        self.bucket = os.environ["S3_BUCKET"]
        self.c = boto3.client("s3", endpoint_url=os.environ.get("S3_ENDPOINT") or None, region_name=os.environ.get("S3_REGION") or "us-east-1",
                              aws_access_key_id=os.environ["S3_ACCESS_KEY"], aws_secret_access_key=os.environ["S3_SECRET_KEY"], config=cfg)

    def _k(self, public, name): return ("pub/" if public else "priv/") + name
    def put(self, public, name, fobj, mime): self.c.upload_fileobj(fobj, self.bucket, self._k(public, name), ExtraArgs={"ContentType": mime})
    def delete(self, public, name):
        try: self.c.delete_object(Bucket=self.bucket, Key=self._k(public, name))
        except Exception: pass  # a missing file must not block deleting the record
    def send(self, public, name, filename, mime, inline, cache):
        try: o = self.c.get_object(Bucket=self.bucket, Key=self._k(public, name))
        except self.c.exceptions.NoSuchKey: raise HTTPException(404, "Not found")
        h = {"Cache-Control": cache, "Content-Disposition": _cd(filename, inline), "Content-Length": str(o["ContentLength"])}
        return StreamingResponse(o["Body"].iter_chunks(64 * 1024), media_type=mime, headers=h)


store = S3() if os.environ.get("S3_BUCKET") else Disk(os.environ.get("DATA_DIR", "./data"))
