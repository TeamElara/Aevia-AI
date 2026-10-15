"""Run with onnxruntime+onnx installed; quantizes the pinned cached upstream model locally."""
from pathlib import Path
from onnxruntime.quantization import quantize_dynamic, QuantType
base = Path('.cache/models/protectai/deberta-v3-base-prompt-injection-v2/90c9989b1a342275dd0d1a95aad283c04e075671/onnx')
quantize_dynamic(str(base/'model.onnx'), str(base/'model_quantized.onnx'), weight_type=QuantType.QInt8)
print((base/'model_quantized.onnx').stat().st_size)
