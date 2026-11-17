# Image staport-intelligence-mcp-excel : classeurs Excel créés par l'agent (compétence « tableur », site/docs/ia).
# excel-mcp-server (MIT) n'a pas d'image publiée : on l'installe ici, en version exacte (veille : scripts/ia/verrous.txt).
FROM python:3.13-slim
RUN pip install --no-cache-dir excel-mcp-server==2.3.2 \
    && useradd --system --no-create-home --uid 10001 excel
USER excel
# /data est un tmpfs en production (docker-compose.yml) : les classeurs ne survivent pas au conteneur.
ENV EXCEL_FILES_PATH=/data
EXPOSE 8017
# Le jeton vient de EXCEL_MCP_AUTH_TOKEN ; le serveur n'écrit que sous /data.
CMD ["excel-mcp-server", "streamable-http", "--host", "0.0.0.0", "--allow-dir", "/data"]
