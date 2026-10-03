const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');

const bot = new Telegraf(process.env.BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
    try {
        // Hitung H+2 dari hari ini
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + 2);
        const targetDateStr = targetDate.toISOString().split('T')[0];

        console.log(`🔍 Cek jatuh tempo: ${targetDateStr}`);

        const { data, error } = await supabase.from('subscriptions')
            .select('*')
            .eq('status_aktif', true)
            .eq('jatuh_tempo', targetDateStr)
            .not('telegram_id', 'is', null);

        if (error) throw error;

        let terkirim = 0;
        if (data && data.length > 0) {
            for (const user of data) {
                const formatTgl = new Date(user.jatuh_tempo).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

                const pesan =
                    `⚠️ *PENGINGAT MASA AKTIF* ⚠️\n\n` +
                    `Halo *${user.nama}*, layanan *${user.layanan}* kamu akan berakhir pada *${formatTgl}* (2 hari lagi).\n\n` +
                    `Yuk perpanjang sekarang lewat menu /start agar aksesmu tidak terputus! 🔥`;

                try {
                    await bot.telegram.sendMessage(user.telegram_id, pesan, { parse_mode: 'Markdown' });
                    terkirim++;
                } catch (err) {
                    console.log(`❌ Gagal kirim ke ${user.telegram_id}:`, err.message);
                }
            }
        }

        console.log(`✅ Cron selesai. Terkirim: ${terkirim}/${data?.length || 0}`);
        return res.status(200).send(`Cron OK. Terkirim ke ${terkirim} pelanggan.`);
    } catch (err) {
        console.log("❌ Cron error:", err.message);
        // Tetap return 200 agar Vercel tidak retry terus
        return res.status(200).send('Cron selesai dengan error: ' + err.message);
    }
}