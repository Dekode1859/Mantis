FROM python:3.11-slim

WORKDIR /app

# Install system dependencies including Chrome (Chrome install may fail but that's ok)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    wget \
    gnupg \
    ca-certificates \
    && (wget -q -O /tmp/google-chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb \
    && apt-get install -y /tmp/google-chrome.deb \
    && rm /tmp/google-chrome.deb || true) \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose port 8000
EXPOSE 8000

# Run uvicorn server with multiple workers for production
# Workers: 2 * CPU cores + 1 (let's use 4 workers as a good default)
# This allows handling concurrent requests and provides redundancy
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
