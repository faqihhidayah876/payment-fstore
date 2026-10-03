const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const midtransClient = require('midtrans-client');

const bot = new Telegraf(process.env.BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const coreApi = new midtransClient.CoreApi({
    isProduction: true, // Mode produksi (QRIS asli)
    serverKey: process.env.MIDTRANS_SERVER_KEY
});

// --- MENU UTAMA ---
const tampilkanMenuUtama = (nama) => {
    return {
        text: `👑 *f-store* ✨\nProduk langganan digital premium otomatis.\n\nHalo *${nama}*! 🔥\n\n⬇️ *Pilih menu di bawah buat mulai:*`,
        options: {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('✨ Perpanjang Gemini Pro', 'bayar_gemini')],
                [Markup.button.callback('🎨 Perpanjang Canva Pro', 'menu_canva')],
                [Markup.button.callback('📋 Riwayat & Status', 'cek_status'), Markup.button.callback('🔑 Kode Unik', 'input_kode')]
            ])
        }
    };
};

// 1. Command /start
bot.start(async (ctx) => {
    const telegram_id = ctx.from.id;
    const nama = ctx.from.first_name;

    const { data } = await supabase.from('subscriptions').select('*').eq('telegram_id', telegram_id).single();

    const menu = tampilkanMenuUtama(nama);
    let pesanStart = menu.text;

    // Jika belum terdaftar sama sekali, beri instruksi via tombol Kode Unik atau /klaim
    if (!data) {
        pesanStart += `\n\n⚠️ _Jika kamu anggota Family Sharing lama, silakan klik tombol *🔑 Kode Unik* di bawah, atau ketik:_ \`/klaim KODE_KAMU\`\n_(Contoh: /klaim HSB123)_`;
    }

    await ctx.reply(pesanStart, menu.options);
});

// 2. Command /klaim KODE (Sistem Sinkronisasi manual via command)
bot.command('klaim', async (ctx) => {
    const teks = ctx.message.text;
    const argumen = teks.split(' '); // Memisahkan "/klaim" dan "KODENYA"

    if (argumen.length !== 2) {
        return ctx.reply('⚠️ Format salah. Ketik dengan format:\n`/klaim KODE_DARI_ADMIN`', { parse_mode: 'Markdown' });
    }

    const kode_klaim = argumen[1].toUpperCase();
    const telegram_id = ctx.from.id;

    // Cari kode di database
    const { data, error } = await supabase.from('subscriptions').select('*').eq('kode_sinkronisasi', kode_klaim).single();

    if (error || !data) {
        return ctx.reply('❌ Kode tidak valid atau tidak ditemukan. Pastikan ketikanmu benar atau hubungi Admin.');
    }

    if (data.telegram_id) {
        return ctx.reply('⚠️ Kode ini sudah terpakai dan tertaut dengan akun Telegram lain.');
    }

    // Hubungkan ID Telegram dan hapus kode agar tidak bisa diklaim 2x
    await supabase.from('subscriptions').update({ telegram_id: telegram_id, kode_sinkronisasi: null }).eq('id', data.id);

    ctx.reply(`✅ *Sinkronisasi Berhasil!*\n\nSelamat datang kembali, *${data.nama}*! Akun Telegram kamu telah terhubung dengan layanan *${data.layanan}*.\nKetik /start untuk membuka menu utama.`, { parse_mode: 'Markdown' });
});

// --- TOMBOL KODE UNIK (Klik tombol lalu kirim kode via chat) ---
bot.action('input_kode', async (ctx) => {
    await ctx.reply(
        '🔑 *Tautkan Akun*\n\nSilakan _Copy_ dan _Paste_ (Kirim) kode unik yang diberikan oleh Admin secara langsung ke obrolan ini 👇',
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Kembali', 'kembali_menu')]])
        }
    );
});

// --- DETEKSI KODE UNIK VIA CHAT BIASA ---
bot.on('text', async (ctx) => {
    const text = ctx.message.text.trim().toUpperCase();

    // Abaikan command yang diawali "/"
    if (text.startsWith('/')) return;

    // Asumsi kode unik panjangnya 5-8 karakter
    if (text.length >= 5 && text.length <= 8) {
        const { data, error } = await supabase.from('subscriptions').select('*').eq('kode_sinkronisasi', text).single();

        if (data) {
            if (data.telegram_id) {
                return ctx.reply('⚠️ Kode ini sudah terpakai oleh akun Telegram lain.');
            }
            // Hubungkan ID Telegram dan hapus kode agar tidak bisa diklaim 2x
            await supabase.from('subscriptions').update({ telegram_id: ctx.from.id, kode_sinkronisasi: null }).eq('id', data.id);
            return ctx.reply(`✅ *Sinkronisasi Berhasil!*\n\nSelamat datang kembali, *${data.nama}*! Akun Telegram kamu telah terhubung dengan layanan *${data.layanan}*.\nKetik /start untuk membuka menu utama.`, { parse_mode: 'Markdown' });
        }
    }
    // Jika bukan kode, bot diam saja agar tidak mengganggu
});

// --- MENU CANVA ---
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

// --- KEMBALI KE MENU UTAMA (Robust: handle edit & reply) ---
bot.action('kembali_menu', async (ctx) => {
    const menu = tampilkanMenuUtama(ctx.from.first_name);
    try {
        await ctx.editMessageText(menu.text, menu.options);
    } catch (error) {
        // Fallback jika pesan tidak bisa diedit (misal pesan lama atau pesan foto)
        try {
            await ctx.deleteMessage();
        } catch (e) { /* abaikan */ }
        await ctx.reply(menu.text, menu.options);
    }
});

// --- FUNGSI GENERATE QRIS ---
const prosesTagihan = async (ctx, namaLayanan, hargaAsli, kodeLayanan) => {
    await ctx.editMessageText(`⏳ _Sedang menyiapkan tagihan QRIS untuk ${namaLayanan}..._`, { parse_mode: 'Markdown' });

    const kodeUnik = Math.floor(Math.random() * 999) + 1;
    const totalBayar = hargaAsli + kodeUnik;
    const telegram_id = ctx.from.id;
    const order_id = `${kodeLayanan}-${telegram_id}-${Date.now()}`;

    // Simpan/Update data user beserta last_order_id ke Supabase
    const { data } = await supabase.from('subscriptions').select('id').eq('telegram_id', telegram_id).single();
    if (!data) {
        await supabase.from('subscriptions').insert([{
            telegram_id: telegram_id,
            nama: ctx.from.first_name,
            layanan: namaLayanan.split(' ')[0],
            status_aktif: false,
            last_order_id: order_id
        }]);
    } else {
        await supabase.from('subscriptions').update({ last_order_id: order_id }).eq('telegram_id', telegram_id);
    }

    let parameter = {
        "payment_type": "qris",
        "transaction_details": { "order_id": order_id, "gross_amount": totalBayar }
    };

    try {
        const chargeResponse = await coreApi.charge(parameter);
        const qrisUrl = chargeResponse.actions[0].url;

        await ctx.deleteMessage();
        await ctx.replyWithPhoto(
            { url: qrisUrl },
            {
                caption: `✅ *Tagihan Dibuat!*\n\n🧾 *Order ID:* \`${order_id}\`\n💻 *Layanan:* ${namaLayanan}\n💰 *Total:* *Rp${totalBayar.toLocaleString('id-ID')}*\n\n_Silakan bayar sesuai nominal. Jika pembayaran berhasil namun akses belum masuk, copy Order ID di atas dan kirimkan ke Admin._`,
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([[Markup.button.callback('❌ Batalkan Pesanan', 'batal_pesanan')]])
            }
        );
    } catch (error) {
        await ctx.reply('❌ Sistem pembayaran sedang sibuk. Silakan coba beberapa saat lagi.');
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

// --- CEK STATUS & RIWAYAT ---
bot.action('cek_status', async (ctx) => {
    const telegram_id = ctx.from.id;
    const { data, error } = await supabase.from('subscriptions').select('*').eq('telegram_id', telegram_id).single();

    // Tombol kembali untuk kedua skenario (error & sukses)
    const tombolKembali = Markup.inlineKeyboard([[Markup.button.callback('🔙 Kembali', 'kembali_menu')]]);

    if (error || !data) {
        return ctx.reply(
            '⚠️ *Data Belum Ditemukan*\nSilakan klik tombol *🔑 Kode Unik* jika kamu punya kode dari Admin, atau beli layanan terlebih dahulu.',
            {
                parse_mode: 'Markdown',
                ...tombolKembali
            }
        );
    }

    const statusPesan = data.status_aktif ? "✅ AKTIF" : "❌ BELUM BAYAR / HABIS";

    // Format tanggal ke gaya Indonesia
    const formatTanggal = data.jatuh_tempo
        ? new Date(data.jatuh_tempo).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
        : 'Belum ada data pembayaran';

    const pesan = `📋 *RIWAYAT AKUN KAMU*\n\n👤 *Nama:* ${data.nama}\n💻 *Layanan:* ${data.layanan || '-'}\n🔖 *Status:* ${statusPesan}\n⏳ *Berlaku Sampai:* ${formatTanggal}`;
    await ctx.reply(pesan, {
        parse_mode: 'Markdown',
        ...tombolKembali
    });
});

// --- WEBHOOK & LOGIKA PENAMBAHAN HARI ---
export default async function handler(req, res) {
    if (req.method === 'POST') {
        if (req.body.message || req.body.callback_query) {
            await bot.handleUpdate(req.body);
            return res.status(200).send('OK');
        }

        if (req.body.transaction_status) {
            const status = req.body.transaction_status;
            const order_id = req.body.order_id;

            if (status === 'settlement' || status === 'capture') {
                const parts = order_id.split('-');
                const kodeLayanan = parts[0]; // GEMINI1M, CANVA3M, dll
                const telegram_id = parts[1];

                // Penentuan jumlah hari perpanjangan
                let tambahanHari = 30; // Default 1 bulan
                if (kodeLayanan === 'CANVA3M') tambahanHari = 90;
                if (kodeLayanan === 'CANVA6M') tambahanHari = 180;
                if (kodeLayanan === 'CANVA1Y') tambahanHari = 365;

                // Ambil jatuh_tempo saat ini
                const { data: user } = await supabase.from('subscriptions').select('jatuh_tempo').eq('telegram_id', parseInt(telegram_id)).single();

                let tanggalDasar = new Date(); // Hitung mulai hari ini
                // Jika masa aktif masih ada, tambahkan harinya dari tanggal masa aktif terakhir
                if (user && user.jatuh_tempo) {
                    const currentJatuhTempo = new Date(user.jatuh_tempo);
                    if (currentJatuhTempo > tanggalDasar) {
                        tanggalDasar = currentJatuhTempo;
                    }
                }

                // Tambahkan hari sesuai paket
                tanggalDasar.setDate(tanggalDasar.getDate() + tambahanHari);
                const newJatuhTempo = tanggalDasar.toISOString().split('T')[0];

                await supabase.from('subscriptions')
                    .update({ status_aktif: true, jatuh_tempo: newJatuhTempo })
                    .eq('telegram_id', parseInt(telegram_id));

                await bot.telegram.sendMessage(telegram_id, `🎉 *Pembayaran Lunas!*\n\nAkses kamu berhasil diperpanjang selama *${tambahanHari} hari*. Masa aktif kamu sekarang hingga *${tanggalDasar.toLocaleDateString('id-ID')}*.`, { parse_mode: 'Markdown' });
            }
            return res.status(200).send('OK');
        }
    }
    res.status(200).send('Bot berjalan!');
}