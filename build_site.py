import os
import re
import pandas as pd
from googleapiclient.discovery import build

# 如果是在本機執行，建議安裝 pip install python-dotenv
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

def main():
    # 1. 取得環境變數
    api_key = os.environ.get('GOOGLE_API_KEY')
    sheet_id = os.environ.get('DOC_ID')
    gas_url = os.environ.get('GAS_URL', '預設網址')
    
    if not api_key or not sheet_id:
        print("❌ Error: GOOGLE_API_KEY or DOC_ID not found.")
        return

    # 初始化 Google Sheets API
    service = build('sheets', 'v4', developerKey=api_key)
    sheet = service.spreadsheets()

    # 初始化產出內容
    all_days_html = ""
    checklist_html = ""
    light_colors = {}
    dark_colors = {}

    # --- 1. 處理行程表 (Schedule Tab) ---
    print("📋 Fetching Schedule...")
    try:
        # 讀取 A 到 H 欄 (H 欄預期為 Note)
        sched_res = sheet.values().get(spreadsheetId=sheet_id, range='Schedule!A:I').execute()
        sched_rows = sched_res.get('values', [])
        
        if sched_rows:
            headers = sched_rows[0]
            # 建立 DataFrame 並將空值填補為空字串
            df_sched = pd.DataFrame(sched_rows[1:], columns=headers).fillna('')
            
            # 確保欄位名稱正確
            grouped = df_sched.groupby(['Day', 'Date', 'Title'], sort=False)
            for (day, date, title), group in grouped:
                # 轉換日期格式：從中文格式轉為 YYYY-MM-DD
                import re
                from datetime import datetime

                weekday_map = ['一', '二', '三', '四', '五', '六', '日']

                date_match = re.search(r'(\d{4})年(\d{1,2})月(\d{1,2})日', date)
                if date_match:
                    year, month, day_num = date_match.groups()
                    iso_date = f"{year}-{month.zfill(2)}-{day_num.zfill(2)}"
                    # 計算星期幾
                    date_obj = datetime.strptime(iso_date, '%Y-%m-%d')
                    weekday = weekday_map[date_obj.weekday()]
                    display_date = f"{month}/{day_num} 星期{weekday}"
                else:
                    # 如果已經是 YYYY-MM-DD 格式
                    iso_date = date
                    try:
                        date_obj = datetime.strptime(iso_date, '%Y-%m-%d')
                        weekday = weekday_map[date_obj.weekday()]
                        month = iso_date[5:7].lstrip('0')
                        day_num = iso_date[8:10].lstrip('0')
                        display_date = f"{month}/{day_num} 星期{weekday}"
                    except:
                        display_date = date[5:].replace('-', '/') if len(date) >= 10 else date

                box_html = f'<div class="schedule-box" data-date="{iso_date}">\n'
                box_html += f'    <div class="day-info"><span class="tag">{day}</span> <span class="date-text">{display_date}</span></div>\n'
                box_html += f'    <h3>{title}</h3>\n    <ul>\n'
                
                for _, row in group.iterrows():
                    activity = str(row.get('Activity', '')).strip()
                    time = str(row.get('Time', '')).strip()
                    location = str(row.get('Location_Name', '')).strip()
                    icon = str(row.get('Icon', '')).strip()
                    maps_url = str(row.get('Maps_URL', '')).strip()
                    note = str(row.get('Note', '')).strip()
                    
                    # 處理刪除線 (~~文字~~)
                    if activity.startswith('~~') and activity.endswith('~~'):
                        display_act = f'<s><span class="time-label">{time}</span> {activity.replace("~~", "")}</s>'
                    else:
                        display_act = f'<span class="time-label">{time}</span> {activity}'
                    
                    # 組合 Note (備註)
                    note_html = f'<div class="label-note" style="margin-top: 10px; margin-left: 5px;">{note}</div>' if note and note.lower() != 'nan' else ""
                    
                    # 組合地點連結
                    map_html = f'<br>{icon}<a href="{maps_url}" target="_blank"> {location}</a>' if maps_url and location else ""
                    
                    box_html += f'        <li style="margin-bottom: 15px;">{display_act}{note_html}{map_html}</li>\n'
                
                box_html += "    </ul>\n</div>\n"
                all_days_html += box_html
        else:
            print("⚠️ Schedule tab is empty.")
    except Exception as e:
        print(f"❌ Schedule error: {e}")

    # --- 2. 處理檢查清單 (Checklist Tab) ---
    print("✅ Fetching Checklist...")
    try:
        check_res = sheet.values().get(spreadsheetId=sheet_id, range='Checklist!A:C').execute()
        check_rows = check_res.get('values', [])
        if check_rows:
            df_check = pd.DataFrame(check_rows[1:], columns=check_rows[0]).fillna('')
            for cat, group in df_check.groupby('Category', sort=False):
                checklist_html += f'    <div class="checklist-cat">{cat}</div>\n'
                for i, row in group.iterrows():
                    item_id = f"item_{i}"
                    c_item = str(row.get("Item", ""))
                    c_note = str(row.get("Note", ""))
                    c_note_html = f'<span class="label-note">{c_note}</span>' if c_note and c_note.lower() != 'nan' else ""
                    checklist_html += f'    <div class="item"><input type="checkbox" id="{item_id}"><label for="{item_id}">{c_item}{c_note_html}</label></div>\n'
    except Exception as e:
        print(f"❌ Checklist error: {e}")

    # --- 3. 處理顏色設定與功能設定 (Settings Tab) ---
    print("🎨 Fetching Settings...")
    # 設定預設值
    weather_city = 'KOBE'  # 預設值
    exchange_from = 'JYP'  # 預設值
    exchange_to = 'TWD'  # 預設值

    try:
        sett_res = sheet.values().get(spreadsheetId=sheet_id, range='Settings!A:C').execute()
        for row in sett_res.get('values', [])[1:]:
            if len(row) >= 2:
                key = row[0].strip()
                val = row[1].strip()

                # 處理顏色設定
                if len(row) >= 3:
                    mode = row[2].strip().lower()
                    if mode == 'light':
                        light_colors[key] = val
                    elif mode == 'dark':
                        dark_colors[key] = val

                # 處理功能設定
                if key == 'weather_city':
                    weather_city = val
                elif key == 'exchange_from':
                    exchange_from = val
                elif key == 'exchange_to':
                    exchange_to = val
    except Exception as e:
        print(f"❌ Settings error: {e}")

    # --- 3.5 處理站點 Metadata (Site Tab) ---
    site_meta = {}
    print("📝 Fetching Site metadata...")
    try:
        site_res = sheet.values().get(spreadsheetId=sheet_id, range='Site!A:D').execute()
        vals = site_res.get('values', [])
        if not vals:
            pass
        elif len(vals) == 1:
            # single-row format: [PAGE_TITLE, H1_TITLE, SUBTITLE, FOOTER]
            row = vals[0]
            site_meta['PAGE_TITLE'] = row[0].strip() if len(row) > 0 else ''
            site_meta['H1_TITLE'] = row[1].strip() if len(row) > 1 else ''
            site_meta['SUBTITLE'] = row[2].strip() if len(row) > 2 else ''
            site_meta['FOOTER'] = row[3].strip() if len(row) > 3 else ''
        else:
            # multi-row format: either header + data, or key/value rows
            header = [c.strip().upper() for c in vals[0]]
            if any(h in ('PAGE_TITLE', 'H1_TITLE', 'SUBTITLE', 'FOOTER') for h in header) and len(vals) > 1:
                data = vals[1]
                for idx, h in enumerate(header):
                    if h == 'PAGE_TITLE' and idx < len(data): site_meta['PAGE_TITLE'] = data[idx].strip()
                    if h == 'H1_TITLE' and idx < len(data): site_meta['H1_TITLE'] = data[idx].strip()
                    if h == 'SUBTITLE' and idx < len(data): site_meta['SUBTITLE'] = data[idx].strip()
                    if h == 'FOOTER' and idx < len(data): site_meta['FOOTER'] = data[idx].strip()
            else:
                # fallback: treat each row as key/value pair
                for row in vals:
                    if len(row) >= 2:
                        k = row[0].strip()
                        v = row[1].strip()
                        site_meta[k] = v
    except Exception as e:
        # It's okay if Site tab doesn't exist
        print(f"⚠️ Site metadata warning: {e}")

    # 3.6 處理帳務記錄的付款人選項 (Accounting Tab)
    acc_payers_options = ""
    print("💰 Fetching Accounting payers...")
    try:
        acc_res = sheet.values().get(spreadsheetId=sheet_id, range='Accounting!A:B').execute()
        acc_rows = acc_res.get('values', [])
        for row in acc_rows[1:]:  # skip header
            if row:
                value,payer = row[0].strip(), row[1].strip()
                if payer:
                    acc_payers_options += f'<option value="{value}">{payer}</option>\n'
    except Exception as e:
        print(f"⚠️ Accounting payers warning: {e}")
    # --- 4. 生成檔案 ---
    print("🏗️ Building files...")
    # 讀取模板
    with open('index.html', 'r', encoding='utf-8') as f:
        html_template = f.read()
    
    # 替換 HTML 佔位符
    final_html = html_template.replace('{{SCHEDULE_CONTENT}}', all_days_html)
    final_html = final_html.replace('{{CHECKLIST_CONTENT}}', checklist_html)
    # inject site metadata (page title, h1, subtitle, footer)
    final_html = final_html.replace('{{PAGE_TITLE}}', site_meta.get('PAGE_TITLE'))
    final_html = final_html.replace('{{H1_TITLE}}', site_meta.get('H1_TITLE'))
    final_html = final_html.replace('{{SUBTITLE}}', site_meta.get('SUBTITLE'))
    final_html = final_html.replace('{{FOOTER}}', site_meta.get('FOOTER', 'MALAYSIA 2026 | FAMILY TRAVEL ASSISTANT'))
    # inject accounting payers options
    final_html = final_html.replace('{{ACC_PAYERS_OPTIONS}}', acc_payers_options)

    # 注入匯率和天氣設定
    final_html = final_html.replace('{{WEATHER_CITY}}', weather_city)
    final_html = final_html.replace('{{EXCHANGE_FROM}}', exchange_from)
    final_html = final_html.replace('{{EXCHANGE_TO}}', exchange_to)

    # 讀取 CSS 並處理深淺色替換
    with open('style.css', 'r', encoding='utf-8') as f:
        css_content = f.read()

    # 切割 CSS 以分別處理深淺色變數
    css_parts = re.split(r'(@media\s*\(prefers-color-scheme:\s*dark\)\s*\{)', css_content)
    if len(css_parts) >= 3:
        light_part = css_parts[0]
        media_header = css_parts[1]
        dark_part = css_parts[2]

        for k, v in light_colors.items():
            light_part = re.sub(f'{re.escape(k)}:\\s*[^;]+;', f'{k}: {v};', light_part)
        for k, v in dark_colors.items():
            dark_part = re.sub(f'{re.escape(k)}:\\s*[^;]+;', f'{k}: {v};', dark_part)
        
        final_css = light_part + media_header + dark_part
    else:
        # 若無媒體查詢區塊，則僅進行一般替換
        final_css = css_content
        for k, v in light_colors.items():
            final_css = re.sub(f'{re.escape(k)}:\\s*[^;]+;', f'{k}: {v};', final_css)

    # 確保輸出目錄存在
    os.makedirs('public', exist_ok=True)
    
    with open('public/index.html', 'w', encoding='utf-8') as f:
        f.write(final_html)
    with open('public/style.css', 'w', encoding='utf-8') as f:
        f.write(final_css)
    
    # 複製 JS 檔案
    if os.path.exists('script.js'):
        import shutil
        shutil.copy('script.js', 'public/script.js')

    # 複製 Service Worker
    if os.path.exists('sw.js'):
        import shutil
        shutil.copy('sw.js', 'public/sw.js')

    # 複製 manifest.json
    if os.path.exists('manifest.json'):
        import shutil
        shutil.copy('manifest.json', 'public/manifest.json')

    # 複製 PWA icon
    if os.path.exists('pwa-icon-256x256.png'):
        import shutil
        shutil.copy('pwa-icon-256x256.png', 'public/pwa-icon-256x256.png')    

    # 複製 favicon
    if os.path.exists('favicon.svg'):
        import shutil
        shutil.copy('favicon.svg', 'public/favicon.svg')                

    # 2. 讀取 JS 模板並替換佔位符
    with open('script.js', 'r', encoding='utf-8') as f:
        content = f.read()

    # 將 JS 裡的 {{GAS_URL}} 替換成真正的 Secret
    final_js = content.replace('{{GAS_URL}}', gas_url)

    # 3. 寫入到部署用的資料夾
    with open('public/script.js', 'w', encoding='utf-8') as f:
        f.write(final_js)

    print("✨ Build Success! Files are ready in /public")

if __name__ == "__main__":
    main()
