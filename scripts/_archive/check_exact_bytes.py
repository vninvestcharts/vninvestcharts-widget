with open(r'C:\Mujoco Projects\vninvestcharts\src\widget\VNInvestMultiCharts.tsx', 'rb') as f:
    content = f.read()

idx = content.find(b'onOpenSettings={() => {')
if idx >= 0:
    actual = content[idx:idx+125]
    print('Actual bytes:')
    for i, b in enumerate(actual):
        if b == 9:
            print(f'  [{i}] TAB')
        elif b == 10:
            print(f'  [{i}] LF')
        elif b == 13:
            print(f'  [{i}] CR')
        elif b == 32:
            print(f'  [{i}] SPACE')
        elif 33 <= b <= 126:
            print(f'  [{i}] {chr(b)}')
        else:
            print(f'  [{i}] 0x{b:02x}')
