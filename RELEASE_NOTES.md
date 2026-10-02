Read searchable and scanned PDFs in DeepSeek Harness through five tools: inspect, read, search, render and dependency status. Page images and crops are returned as Harness image attachments when the routed model supports vision. English and Simplified Chinese OCR run locally with Tesseract.

Install the attached `.tgz` through the desktop Plugins page and enable `dsh-pdf-reader`. Install Poppler and Tesseract separately; see the README for platform setup and official desktop profile instructions. No npm runtime dependencies or model weights are included.

Validation covers real Harness services, OCR, citations, truncation, rendering/crops, permissions, cancellation and explicit failure reporting. Official desktop compatibility is based on shared APIs and its documented plugin mechanism; its packaged GUI and Windows are not yet verified. OCR and complex visual interpretation remain fallible, and no model-accuracy improvement percentage is claimed.

All 15 integration tests passed in each of three CI jobs: Linux with Node 22 and 24, and macOS with Node 24. See [CI evidence](https://github.com/SkanderBog/dsh-pdf-reader/actions/runs/36973885294).
