const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const midtransClient = require('midtrans-client');

const bot = new Telegraf(process.env.BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const coreApi = new midtransClient.CoreApi({
    isProduction: true,
    serverKey: process.env.MIDTRANS_SERVER_KEY
});

// ============================================
// --- KONFIGURASI (WAJIB DIISI) ---
// ============================================
const CHANNEL_USERNAME = '@FStoreSupport';
const QRIS_FALLBACK_URL = "https://i.postimg.cc/bJn4G5ms/qris.jpg";

// ============================================
// --- FUNGSI KIRIM PESAN DENGAN FALLBACK ---
// ============================================
// Fungsi ini mencoba kirim dengan Markdown. Kalau gagal, kirim ulang tanpa format.
const safeSendMessage = async (chatId, pesan) => {
    try {
        await bot.telegram.sendMessage(chatId, pesan, { parse_mode: 'Markdown' });
        return true;
    } catch (err1) {
        console.log("⚠️ Markdown gagal, coba plain text. Error:", err1.message);
        try {
            // Hapus karakter Markdown agar pesan tetap terkirim
            const pesanPolos = pesan.replace(/[*_`\[\]]/g, '');
            await bot.telegram.sendMessage(chatId, pesanPolos);
            return true;
        } catch (err2) {
            console.log("❌ Gagal kirim pesan sama sekali:", err2.message);
            return false;
        }
    }
};

// ============================================
// --- FUNGSI CEK STATUS JOIN CHANNEL ---
// ============================================
const isUserJoined = async (ctx) => {
    try {
        const member = await ctx.telegram.getChatMember(CHANNEL_USERNAME, ctx.from.id);
        return ['creator', 'administrator', 'member', 'restricted'].includes(member.status);
    } catch (error) {
        console.log("Error cek member:", error.message);
        return false;
    }
};

// --- MENU UTAMA ---
const tampilkanMenuUtama = (nama) => {
    return {
        text: `👑 *f-store* ✨\nProduk langganan digital premium otomatis.\n\nHalo *${nama}*! 🔥\n\n⬇️ *Pilih menu di bawah buat mulai:*`,
        options: {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('✦ Perpanjang Gemini Pro', 'bayar_gemini')],
                [Markup.button.callback('🎨 Perpanjang Canva Pro', 'menu_canva')],
                [Markup.button.callback('📋 Riwayat & Status', 'cek_status'), Markup.button.callback('🔑 Kode Unik', 'input_kode')]
            ])
        }
    };
};

// --- PESAN FORCE JOIN ---
const pesanForceJoin = () => {
    return {
        text: `👋 *Halo! Selamat datang di f-store* ✨\n\nUntuk menggunakan layanan kami, kamu *wajib bergabung* ke Channel Update & Testimoni terlebih dahulu.\n\n📢 *Kenapa harus join?*\n• Lihat bukti transaksi pelanggan lain\n• Dapat info promo & produk terbaru\n• Channel hanya admin yang bisa chat\n\n_Klik tombol di bawah untuk bergabung, lalu tekan Cek Status._`,
        options: {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.url('📢 Gabung Channel', `https://t.me/${CHANNEL_USERNAME.replace('@', '')}`)],
                [Markup.button.callback('🔄 Cek Status Join', 'cek_join')]
            ])
        }
    };
};

// ============================================
// --- 1. COMMAND /START ---
// ============================================
bot.start(async (ctx) => {
    const joined = await isUserJoined(ctx);

    if (!joined) {
        const fj = pesanForceJoin();
        return ctx.reply(fj.text, fj.options);
    }

    const telegram_id = ctx.from.id;
    const nama = ctx.from.first_name;
    const { data } = await supabase.from('subscriptions').select('*').eq('telegram_id', telegram_id).maybeSingle();

    const menu = tampilkanMenuUtama(nama);
    let pesanStart = menu.text;

    if (!data) {
        pesanStart += `\n\n⚠️ _Jika kamu anggota Family Sharing lama, silakan klik tombol *🔑 Kode Unik* di bawah, atau ketik:_ \`/klaim KODE_KAMU\`\n_(Contoh: /klaim HSB123)_`;
    }

    await ctx.reply(pesanStart, menu.options);
});

// --- CEK JOIN ---
bot.action('cek_join', async (ctx) => {
    const joined = await isUserJoined(ctx);

    if (!joined) {
        return ctx.answerCbQuery('⚠️ Kamu belum bergabung ke channel. Silakan gabung dulu ya!', { show_alert: true });
    }

    try { await ctx.deleteMessage(); } catch (e) { /* abaikan */ }

    const telegram_id = ctx.from.id;
    const nama = ctx.from.first_name;
    const { data } = await supabase.from('subscriptions').select('*').eq('telegram_id', telegram_id).maybeSingle();

    const menu = tampilkanMenuUtama(nama);
    let pesanStart = `🎉 *Verifikasi Berhasil!*\n\n` + menu.text;

    if (!data) {
        pesanStart += `\n\n⚠️ _Jika kamu anggota Family Sharing lama, silakan klik tombol *🔑 Kode Unik* di bawah._`;
    }

    await ctx.reply(pesanStart, menu.options);
});

// --- /klaim ---
bot.command('klaim', async (ctx) => {
    const teks = ctx.message.text;
    const argumen = teks.split(' ');

    if (argumen.length !== 2) {
        return ctx.reply('⚠️ Format salah. Ketik dengan format:\n`/klaim KODE_DARI_ADMIN`', { parse_mode: 'Markdown' });
    }

    const kode_klaim = argumen[1].toUpperCase();
    const telegram_id = ctx.from.id;

    const { data, error } = await supabase.from('subscriptions').select('*').eq('kode_sinkronisasi', kode_klaim).maybeSingle();

    if (error || !data) {
        return ctx.reply('❌ Kode tidak valid atau tidak ditemukan. Pastikan ketikanmu benar atau hubungi Admin.');
    }

    if (data.telegram_id) {
        return ctx.reply('⚠️ Kode ini sudah terpakai dan tertaut dengan akun Telegram lain.');
    }

    await supabase.from('subscriptions').update({ telegram_id: telegram_id, kode_sinkronisasi: null }).eq('id', data.id);

    ctx.reply(`✅ *Sinkronisasi Berhasil!*\n\nSelamat datang kembali, *${data.nama}*! Akun Telegram kamu telah terhubung dengan layanan *${data.layanan}*.\nKetik /start untuk membuka menu utama.`, { parse_mode: 'Markdown' });
});

// --- Kode Unik ---
bot.action('input_kode', async (ctx) => {
    await ctx.reply(
        '🔑 *Tautkan Akun*\n\nSilakan _Copy_ dan _Paste_ (Kirim) kode unik yang diberikan oleh Admin secara langsung ke obrolan ini 👇',
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Kembali', 'kembali_menu')]])
        }
    );
});

// --- Deteksi kode via chat ---
bot.on('text', async (ctx) => {
    const text = ctx.message.text.trim().toUpperCase();
    if (text.startsWith('/')) return;

    if (text.length >= 5 && text.length <= 8) {
        const { data } = await supabase.from('subscriptions').select('*').eq('kode_sinkronisasi', text).maybeSingle();

        if (data) {
            if (data.telegram_id) {
                return ctx.reply('⚠️ Kode ini sudah terpakai oleh akun Telegram lain.');
            }
            await supabase.from('subscriptions').update({ telegram_id: ctx.from.id, kode_sinkronisasi: null }).eq('id', data.id);
            return ctx.reply(`✅ *Sinkronisasi Berhasil!*\n\nSelamat datang kembali, *${data.nama}*! Akun Telegram kamu telah terhubung dengan layanan *${data.layanan}*.\nKetik /start untuk membuka menu utama.`, { parse_mode: 'Markdown' });
        }
    }
});

// --- Menu Canva ---
bot.action('menu_canva', async (ctx) => {
    await ctx.editMessageText('🎨 *Pilih durasi perpanjangan Canva Pro:*', {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('1 Bulan (Rp5.000)', 'canva_1m'), Markup.button.callback('3 Bulan (Rp13.000)', 'canva_3m')],
            [Markup.button.callback('6 Bulan (Rp25.000)', 'canva_6m'), Markup.button.callback('1 Tahun (Rp35.000)', 'canva_1y')],
            [Markup.button.callback('🔙 Kembali', 'kembali_menu')]
        ])
    });
});

bot.action('kembali_menu', async (ctx) => {
    const menu = tampilkanMenuUtama(ctx.from.first_name);
    try {
        await ctx.editMessageText(menu.text, menu.options);
    } catch (error) {
        try { await ctx.deleteMessage(); } catch (e) { /* abaikan */ }
        await ctx.reply(menu.text, menu.options);
    }
});

// --- Fungsi Tagihan (Midtrans + Fallback) ---
const prosesTagihan = async (ctx, namaLayanan, hargaAsli, kodeLayanan) => {
    await ctx.editMessageText(`⏳ _Sedang menyiapkan tagihan untuk ${namaLayanan}..._`, { parse_mode: 'Markdown' });

    const kodeUnik = Math.floor(Math.random() * 999) + 1;
    const totalBayar = hargaAsli + kodeUnik;
    const telegram_id = ctx.from.id;
    const order_id = `${kodeLayanan}-${telegram_id}-${Date.now()}`;

    const { data } = await supabase.from('subscriptions').select('id').eq('telegram_id', telegram_id).maybeSingle();
    if (!data) {
        await supabase.from('subscriptions').insert([{
            telegram_id: telegram_id,
            nama: ctx.from.first_name,
            layanan: namaLayanan.split(' ')[0],
            status_aktif: false,
            nominal: totalBayar,
            last_order_id: order_id
        }]);
    } else {
        await supabase.from('subscriptions').update({ last_order_id: order_id, nominal: totalBayar }).eq('telegram_id', telegram_id);
    }

    try {
        let parameter = {
            "payment_type": "qris",
            "transaction_details": { "order_id": order_id, "gross_amount": totalBayar }
        };
        const chargeResponse = await coreApi.charge(parameter);
        const qrisUrl = chargeResponse.actions[0].url;

        await ctx.deleteMessage();
        await ctx.replyWithPhoto(
            { url: qrisUrl },
            {
                caption: `✅ *Tagihan Dibuat! (Otomatis)*\n\n🧾 *Order ID:* \`${order_id}\`\n💻 *Layanan:* ${namaLayanan}\n💰 *Total:* *Rp${totalBayar.toLocaleString('id-ID')}*\n\n_Sistem akan memverifikasi pembayaranmu secara otomatis._`,
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([[Markup.button.callback('❌ Batalkan Pesanan', 'batal_pesanan')]])
            }
        );
    } catch (error) {
        console.log("Midtrans gagal, beralih ke Fallback QRIS Statis...");
        console.log("Error detail:", error.message);

        try { await ctx.deleteMessage(); } catch (e) { /* abaikan */ }

        await ctx.replyWithPhoto(
            { url: QRIS_FALLBACK_URL },
            {
                caption: `⚠️ _Sistem otomatis sedang maintenance. Mengalihkan ke jalur manual..._\n\n✅ *Tagihan Dibuat!*\n\n🧾 *Order ID:* \`${order_id}\`\n💻 *Layanan:* ${namaLayanan}\n💰 *Total Bayar:* *Rp${totalBayar.toLocaleString('id-ID')}*\n\n⚠️ *PENTING:* Transfer **TEPAT** sejumlah nominal di atas hingga 3 digit terakhir.\n\n_Setelah transfer, COPY Order ID di atas dan berikan ke Admin untuk verifikasi manual._`,
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([[Markup.button.callback('❌ Batalkan Pesanan', 'batal_pesanan')]])
            }
        );
    }
};

bot.action('bayar_gemini', (ctx) => prosesTagihan(ctx, 'Gemini Pro (1 Bulan)', 15000, 'GEMINI1M'));
bot.action('canva_1m', (ctx) => prosesTagihan(ctx, 'Canva Pro (1 Bulan)', 5000, 'CANVA1M'));
bot.action('canva_3m', (ctx) => prosesTagihan(ctx, 'Canva Pro (3 Bulan)', 13000, 'CANVA3M'));
bot.action('canva_6m', (ctx) => prosesTagihan(ctx, 'Canva Pro (6 Bulan)', 25000, 'CANVA6M'));
bot.action('canva_1y', (ctx) => prosesTagihan(ctx, 'Canva Pro (1 Tahun)', 35000, 'CANVA1Y'));

bot.action('batal_pesanan', async (ctx) => {
    await ctx.deleteMessage();
    const menu = tampilkanMenuUtama(ctx.from.first_name);
    await ctx.reply('🚫 _Pembuatan tagihan telah dibatalkan._', menu.options);
});

// --- Cek Status ---
bot.action('cek_status', async (ctx) => {
    const telegram_id = ctx.from.id;
    const { data, error } = await supabase.from('subscriptions').select('*').eq('telegram_id', telegram_id).maybeSingle();

    const tombolKembali = Markup.inlineKeyboard([[Markup.button.callback('🔙 Kembali', 'kembali_menu')]]);

    if (error || !data) {
        return ctx.reply(
            '⚠️ *Data Belum Ditemukan*\nSilakan klik tombol *🔑 Kode Unik* jika kamu punya kode dari Admin, atau beli layanan terlebih dahulu.',
            { parse_mode: 'Markdown', ...tombolKembali }
        );
    }

    const statusPesan = data.status_aktif ? "✅ AKTIF" : "❌ BELUM BAYAR / HABIS";
    const formatTanggal = data.jatuh_tempo
        ? new Date(data.jatuh_tempo).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
        : 'Belum ada data pembayaran';

    let teksLinkCanva = '';
    const isCanva = (data.layanan || '').toLowerCase().includes('canva');
    if (isCanva && data.status_aktif) {
        const { data: setting } = await supabase.from('settings').select('nilai').eq('nama_pengaturan', 'link_canva').maybeSingle();
        if (setting && setting.nilai) {
            teksLinkCanva = `\n\n🔗 *Link Akses Canva Kamu:*\n${setting.nilai}`;
        }
    }

    const pesan = `📋 *RIWAYAT AKUN KAMU*\n\n👤 *Nama:* ${data.nama}\n💻 *Layanan:* ${data.layanan || '-'}\n🔖 *Status:* ${statusPesan}\n⏳ *Berlaku Sampai:* ${formatTanggal}${teksLinkCanva}`;
    await ctx.reply(pesan, { parse_mode: 'Markdown', ...tombolKembali });
});

// ============================================
// --- WEBHOOK ---
// ============================================
export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method === 'POST') {
        // Update dari Telegram
        if (req.body.message || req.body.callback_query) {
            try {
                await bot.handleUpdate(req.body);
                return res.status(200).send('OK');
            } catch (e) {
                console.log("Error handleUpdate:", e.message);
                return res.status(200).send('OK');
            }
        }

        // Update dari Midtrans / Dashboard Admin
        if (req.body.transaction_status) {
            console.log("🔔 Webhook diterima:", JSON.stringify(req.body));

            const status = req.body.transaction_status;
            const order_id = req.body.order_id;

            if (status === 'settlement' || status === 'capture') {
                try {
                    const parts = order_id.split('-');
                    const kodeLayanan = parts[0];
                    const telegram_id = parts[1];

                    console.log(`📦 Proses: kode=${kodeLayanan}, telegram_id=${telegram_id}`);

                    let tambahanHari = 30;
                    if (kodeLayanan === 'CANVA3M') tambahanHari = 90;
                    if (kodeLayanan === 'CANVA6M') tambahanHari = 180;
                    if (kodeLayanan === 'CANVA1Y') tambahanHari = 365;

                    // Ambil data user SEBELUM update (pakai maybeSingle agar tidak error)
                    const { data: user, error: userErr } = await supabase
                        .from('subscriptions')
                        .select('nama, jatuh_tempo, nominal')
                        .eq('telegram_id', parseInt(telegram_id))
                        .maybeSingle();

                    if (userErr) console.log("⚠️ Error ambil user:", userErr.message);
                    if (!user) console.log(`⚠️ User dengan telegram_id ${telegram_id} tidak ditemukan di database`);

                    // Hitung tanggal
                    let tanggalDasar = new Date();
                    if (user?.jatuh_tempo && new Date(user.jatuh_tempo) > tanggalDasar) {
                        tanggalDasar = new Date(user.jatuh_tempo);
                    }
                    tanggalDasar.setDate(tanggalDasar.getDate() + tambahanHari);
                    const newJatuhTempo = tanggalDasar.toISOString().split('T')[0];

                    // Update database
                    const { error: updateErr } = await supabase
                        .from('subscriptions')
                        .update({ status_aktif: true, jatuh_tempo: newJatuhTempo })
                        .eq('telegram_id', parseInt(telegram_id));

                    if (updateErr) console.log("❌ Error update database:", updateErr.message);

                    // Nama layanan
                    let namaLayanan = 'Gemini Pro (1 Bulan)';
                    let isCanva = false;

                    if (kodeLayanan === 'CANVA1M') { namaLayanan = 'Canva Pro (1 Bulan)'; isCanva = true; }
                    if (kodeLayanan === 'CANVA3M') { namaLayanan = 'Canva Pro (3 Bulan)'; isCanva = true; }
                    if (kodeLayanan === 'CANVA6M') { namaLayanan = 'Canva Pro (6 Bulan)'; isCanva = true; }
                    if (kodeLayanan === 'CANVA1Y') { namaLayanan = 'Canva Pro (1 Tahun)'; isCanva = true; }

                    const totalBayar = user?.nominal ? Number(user.nominal).toLocaleString('id-ID') : '-';
                    const tanggalFormatted = tanggalDasar.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

                    // Ambil link Canva
                    let teksLinkCanva = '';
                    if (isCanva) {
                        const { data: setting } = await supabase
                            .from('settings')
                            .select('nilai')
                            .eq('nama_pengaturan', 'link_canva')
                            .maybeSingle();

                        if (setting && setting.nilai) {
                            teksLinkCanva = `\n\n🎨 *Akses Canva Pro Kamu:*\n${setting.nilai}\n_(Klik link di atas untuk bergabung ke Tim)_`;
                        }
                    }

                    // Susun pesan sukses
                    const pesanSukses = `🎉 *PEMBAYARAN BERHASIL!*\n\n` +
                        `Terima kasih sudah berlangganan di *f-store* ✨\n\n` +
                        `━━━━━━━━━━━━━━━━━━\n` +
                        `🧾 *Detail Pesanan*\n` +
                        `━━━━━━━━━━━━━━━━━━\n` +
                        `💻 Produk   : ${namaLayanan}\n` +
                        `⏱️ Durasi   : ${tambahanHari} Hari\n` +
                        `💰 Total    : Rp ${totalBayar}\n` +
                        `📅 Aktif s/d: ${tanggalFormatted}\n` +
                        `━━━━━━━━━━━━━━━━━━\n\n` +
                        `✅ Akses kamu sudah OTOMATIS AKTIF.${teksLinkCanva}\n\n` +
                        `Cek status kapan saja lewat tombol *📋 Riwayat & Status* di menu utama.\n\n` +
                        `_Ada kendala? Hubungi admin ya!_ 🙏`;

                    // Kirim ke user (dengan fallback otomatis)
                    console.log(`📨 Kirim pesan sukses ke ${telegram_id}...`);
                    const sent = await safeSendMessage(parseInt(telegram_id), pesanSukses);
                    if (sent) console.log(`✅ Pesan sukses terkirim ke ${telegram_id}`);
                    else console.log(`❌ Pesan sukses GAGAL terkirim ke ${telegram_id}`);

                    // Broadcast ke channel
                    if (user) {
                        const idStr = telegram_id.toString();
                        const maskedId = idStr.substring(0, 3) + '•••' + idStr.substring(idStr.length - 3);
                        const amount = user.nominal ? Number(user.nominal).toLocaleString('id-ID') : '0';
                        const now = new Date();
                        const dateStr = now.toLocaleDateString('en-GB', { timeZone: 'Asia/Jakarta' });
                        const timeStr = now.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour12: false }).replace(/:/g, '.');

                        const broadcastPesan = `📣 *New Purchase!*\n\n` +
                            `ℹ️ *ID:* ${maskedId}\n` +
                            `🛍️ *Product:* ${namaLayanan}\n` +
                            `✅ *Quantity:* 1\n` +
                            `💵 *Amount:* Rp ${amount}\n` +
                            `⏳ *Time:* ${dateStr}, ${timeStr}`;

                        try {
                            await bot.telegram.sendMessage(CHANNEL_USERNAME, broadcastPesan, { parse_mode: 'Markdown' });
                            console.log(`✅ Broadcast ke channel berhasil`);
                        } catch (e) {
                            console.log("❌ Gagal broadcast ke channel:", e.message);
                        }
                    }
                } catch (fatalErr) {
                    console.log("❌❌ ERROR FATAL di webhook:", fatalErr.message);
                    console.log(fatalErr.stack);
                }
            }

            return res.status(200).send('OK');
        }
    }
    res.status(200).send('Bot berjalan!');
}