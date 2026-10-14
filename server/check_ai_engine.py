import json
import sys

res = {
    'pythonVersion': sys.version.split()[0],
    'torch': {'installed': False, 'version': '', 'cuda': False, 'device': ''},
    'demucs': {'installed': False, 'version': ''},
    'whisper': {'installed': False, 'version': ''},
}

try:
    import torch
    res['torch']['installed'] = True
    res['torch']['version'] = getattr(torch, '__version__', '')
    res['torch']['cuda'] = bool(torch.cuda.is_available())
    if res['torch']['cuda']:
        res['torch']['device'] = torch.cuda.get_device_name(0)
    else:
        res['torch']['device'] = 'CPU'
except Exception as e:
    res['torch']['error'] = str(e)

try:
    import demucs
    res['demucs']['installed'] = True
    res['demucs']['version'] = getattr(demucs, '__version__', 'ready')
except Exception as e:
    res['demucs']['error'] = str(e)

try:
    import faster_whisper
    res['whisper']['installed'] = True
    res['whisper']['version'] = getattr(faster_whisper, '__version__', 'ready')
except Exception as e:
    res['whisper']['error'] = str(e)

print('__STATUS__' + json.dumps(res))
