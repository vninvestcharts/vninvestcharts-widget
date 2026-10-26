with open(r'C:\Mujoco Projects\vninvestcharts\src\widget\VNInvestMultiCharts.tsx', 'rb') as f:
    content = f.read()

idx = content.find(b'onRegisterCharts={onSyncContextReady}')
if idx >= 0:
    # Print raw bytes around it
    context = content[idx-100:idx+100]
    print('Raw bytes:')
    for i, b in enumerate(context):
        if b == 10:
            print(f'  [{i}] LF (\\n)')
        elif b == 13:
            print(f'  [{i}] CR (\\r)')
        elif b == 9:
            print(f'  [{i}] TAB (\\t)')
        elif 32 <= b <= 126:
            print(f'  [{i}] {chr(b)}')
        else:
            print(f'  [{i}] 0x{b:02x}')
