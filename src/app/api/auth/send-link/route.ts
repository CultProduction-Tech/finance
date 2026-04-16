import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { isEmailAllowed, generateToken } from "@/lib/auth";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    if (!isEmailAllowed(normalizedEmail)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const token = generateToken(normalizedEmail);
    const baseUrl = request.nextUrl.origin;
    const magicLink = `${baseUrl}/api/auth/verify?token=${token}`;
    const code = token.slice(-6).toUpperCase();

    await resend.emails.send({
      from: "Дашборд <noreply@financial-dashboard.ru>",
      to: normalizedEmail,
      subject: `Вход в дашборд · ${code}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f4f5; padding: 40px 16px;">
          <div style="max-width: 400px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 40px 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
            <h2 style="margin: 0 0 12px; font-size: 20px; color: #111;">Вход в дашборд</h2>
            <p style="color: #555; margin: 0 0 28px; font-size: 15px; line-height: 1.5;">Нажмите кнопку ниже для входа. Ссылка действительна 15 минут.</p>
            <div style="text-align: center;">
              <a href="${magicLink}" style="display: inline-block; background: #008098; color: #ffffff; padding: 14px 40px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px; letter-spacing: 0.01em;">Войти</a>
            </div>
            <p style="color: #999; font-size: 13px; margin: 32px 0 0; line-height: 1.4;">Если вы не запрашивали вход, проигнорируйте это письмо.</p>
          </div>
        </div>
      `,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Send link error:", error);
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }
}
