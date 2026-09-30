# Forge sandbox: Python. Pinned by digest; rebuild deliberately to take upstream updates.
FROM python:3.13-slim@sha256:7c61056e61ac89e852de05f3dc6fa51a6dd2181797bceed46aa725dd7cb2cd3b
RUN groupadd -g 10001 runner && useradd -u 10001 -g 10001 -M -d /tmp -s /usr/sbin/nologin runner \
  && rm -rf /var/lib/apt/lists/* /root/.cache
COPY packages/problem-kit/harness/python_harness.py /opt/forge/harness.py
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PYTHONHASHSEED=0
USER 10001:10001
WORKDIR /tmp
ENTRYPOINT ["python3", "-I", "-S", "/opt/forge/harness.py"]
