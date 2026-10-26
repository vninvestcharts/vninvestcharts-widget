with open(r'C:\Mujoco Projects\vninvestcharts\src\widget\VNInvestMultiCharts.tsx', 'rb') as f:
    content = f.read()

idx = content.find(b'onOpenSettings={() => {')
if idx >= 0:
    # Print each byte with tab count
    for i in range(idx, idx + 200):
        b = content[i]
        if b == 9:  # tab
            print(f'[{i}] TAB')
        elif b == 10:  # newline
            print(f'[{i}] LF')
        elif b == 13:  # CR
            print(f'[{i}] CR')
        elif 32 <= b <= 126:
            print(f'[{i}] {chr(b)}')
        else:
            print(f'[{i}] 0x{b:02x}')
