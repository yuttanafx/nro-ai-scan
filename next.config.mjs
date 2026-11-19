/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        // อนุญาตให้หน้าเว็บนี้ขอใช้ไมค์ได้ (ป้องกันนโยบายเริ่มต้นของโฮสต์บล็อกไว้)
        headers: [{ key: "Permissions-Policy", value: "microphone=(self)" }],
      },
    ];
  },
};
export default nextConfig;
