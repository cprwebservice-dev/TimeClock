# Time-Clock Enterprise V5.1.0

## เพิ่มใหม่
- Enterprise Status Bar: Environment, Role, User, Connection และ Version
- Command Palette เปิดด้วย Ctrl+K / Cmd+K
- Notification Drawer ด้านขวา
- User Profile Center จาก Role badge
- Global Search Trigger รุ่นใหม่
- Responsive รองรับ Desktop และ Mobile

## การทดสอบ
1. Login ด้วย HR_ADMIN
2. กด Ctrl+K และเปิดเมนู Dashboard / Schedule / Settings
3. กดกระดิ่งเพื่อเปิด Notification Drawer
4. กด Role badge เพื่อเปิด Profile Center
5. ตรวจ Status Bar ด้านล่าง
6. ทดสอบ Sidebar ย่อ/ขยาย

## หมายเหตุ
- ไม่เปลี่ยน Business Logic, RPC หรือ RLS
- Supabase ยังคงตรวจสิทธิ์จริงตาม Role และ Scope
