// Vercel Serverless Function: Handle contact form submissions via Resend

export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const RESEND_API_KEY = process.env.RESEND_API_KEY;

    if (!RESEND_API_KEY) {
        console.error('RESEND_API_KEY environment variable is not set');
        return res.status(500).json({ error: 'Email service not configured' });
    }

    const { firstName, lastName, email, service, message } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !email || !service || !message) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    // Map service values to readable names
    const serviceNames = {
        'tax-planning': 'Tax Planning & Compliance',
        'bookkeeping': 'Accounting & Bookkeeping',
        'consulting': 'Business Consulting',
        'multiple': 'Multiple Services',
        'not-sure': 'Not Sure Yet'
    };

    const serviceName = serviceNames[service] || service;

    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: 'CBarmore CPA Website <noreply@cbarmorecpa.com>',
                to: ['charlie@cbarmorecpa.com'],
                reply_to: email,
                subject: `New Contact: ${firstName} ${lastName} — ${serviceName}`,
                html: `
                    <h2>New Contact Form Submission</h2>
                    <table style="border-collapse: collapse; width: 100%; max-width: 600px;">
                        <tr>
                            <td style="padding: 8px 12px; font-weight: bold; border-bottom: 1px solid #eee;">Name</td>
                            <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${firstName} ${lastName}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 12px; font-weight: bold; border-bottom: 1px solid #eee;">Email</td>
                            <td style="padding: 8px 12px; border-bottom: 1px solid #eee;"><a href="mailto:${email}">${email}</a></td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 12px; font-weight: bold; border-bottom: 1px solid #eee;">Service</td>
                            <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${serviceName}</td>
                        </tr>
                    </table>
                    <h3 style="margin-top: 24px;">Message</h3>
                    <p style="white-space: pre-wrap; background: #f9f9f9; padding: 16px; border-radius: 6px;">${message}</p>
                `,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Resend API error:', errorData);
            return res.status(500).json({ error: 'Failed to send message' });
        }

        return res.status(200).json({ success: true });

    } catch (error) {
        console.error('Contact form error:', error);
        return res.status(500).json({ error: 'Failed to send message' });
    }
}
