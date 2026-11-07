#!/usr/bin/env python3
"""Render natural male/female Kokoro neural clips for offline playback.
Development only: pip install kokoro-onnx==0.6.1 soundfile.
Pass --models-dir containing kokoro-v1.0.int8.onnx and voices-v1.0.bin.
Only the WAV results are shipped, not the model or Python runtime.
"""
from pathlib import Path
import argparse
import numpy as np
import onnxruntime as ort
import soundfile as sf
from kokoro_onnx import Kokoro

parser=argparse.ArgumentParser();parser.add_argument('--models-dir',type=Path,required=True);args=parser.parse_args()
root=Path(__file__).resolve().parents[1]
out=root/'modules/dialer/android/src/main/res/raw';out.mkdir(parents=True,exist_ok=True)
options=ort.SessionOptions();options.intra_op_num_threads=2;options.inter_op_num_threads=1
session=ort.InferenceSession(str(args.models_dir/'kokoro-v1.0.int8.onnx'),sess_options=options,providers=['CPUExecutionProvider'])
model=Kokoro.from_session(session,str(args.models_dir/'voices-v1.0.bin'))
clips={'incoming_call':'Incoming call.','incoming_call_from':'Incoming call from.'}
clips.update({f'digit_{index}':word+'.' for index,word in enumerate(['zero','one','two','three','four','five','six','seven','eight','nine'])})
for gender,voice in [('female','af_heart'),('male','am_michael')]:
 for name,text in clips.items():
  samples,rate=model.create(text,voice=voice,speed=1.0,lang='en-us')
  peak=float(np.max(np.abs(samples)))
  if peak>0:samples=samples*(0.88/peak)
  samples=np.concatenate([np.zeros(round(rate*.04),dtype=np.float32),samples,np.zeros(round(rate*.08),dtype=np.float32)])
  sf.write(out/f'{name}_{gender}.wav',samples,rate,subtype='PCM_16')
  print(name,gender,round(len(samples)/rate,2),'seconds',flush=True)
print('Generated all 24 neural voice clips.',flush=True)
