FROM python:3.12-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app/src \
    PATH=/usr/local/bin:/root/.local/bin:${PATH} \
    DISPLAY=:99
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        chromium \
        chromium-sandbox \
        fonts-liberation \
        gosu \
        novnc \
        websockify \
        x11vnc \
        xvfb \
    && rm -rf /var/lib/apt/lists/* \
    && python -m pip install --no-cache-dir uv \
    && uv tool install --python 3.12 --upgrade --force browser-harness==0.1.10 \
    && mkdir -p /root/.codex/skills/browser-harness \
    && browser-harness skill > /root/.codex/skills/browser-harness/SKILL.md \
    && uv tool list > /opt/browser-harness.version \
    && mkdir -p /opt/browser-harness \
    && cp -a /root/.local/share/uv/tools/browser-harness/. /opt/browser-harness/ \
    && sed -i '1s#/root/.local/share/uv/tools/browser-harness#/opt/browser-harness#' /opt/browser-harness/bin/browser-harness \
    && chmod -R a+rX /opt/browser-harness \
    && ln -sf /opt/browser-harness/bin/browser-harness /usr/local/bin/browser-harness

RUN groupadd --gid 10001 browser \
    && useradd --uid 10001 --gid 10001 --create-home --shell /usr/sbin/nologin browser \
    && mkdir -p /app /browser-profiles \
    && chown -R browser:browser /app /browser-profiles

WORKDIR /app
COPY src ./src
COPY tests ./tests
COPY entrypoint.sh /usr/local/bin/browser-service-entrypoint
RUN chmod 0755 /usr/local/bin/browser-service-entrypoint

EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
    CMD python -c "from urllib.request import urlopen; urlopen('http://127.0.0.1:8080/health', timeout=2)"

ENTRYPOINT ["/usr/local/bin/browser-service-entrypoint"]
CMD ["python", "-m", "browser_service"]
