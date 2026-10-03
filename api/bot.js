const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const midtransClient = require('midtrans-client');

const bot = new Telegraf(process.env.BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const coreApi = new midtransClient.CoreApi({
    isProduction: true,
    serverKey: process.env.MIDTRANS_SERVER_KEY
});

const CHANNEL_USERNAME = '@FStoreSupport';
const QRIS_FALLBACK_URL = "https://i.postimg.cc/bJn4G5ms/qris.jpg";

// ============================================
// --- SAFE SEND ---
// ============================================
const safeSendMessage = async (chatId, pesan) => {
    try {
        await bot.telegram.sendMessage(chatId, pesan, { parse_mode: 'Markdown' });
        return true;
    } catch (err1) {
        console.log("⚠️ Markdown gagal, fallback plain text:", err1.message);
        try {
            const pesanPolos = pesan.replace(/[*_`\[\]()]/g, '');
            await bot.telegram.sendMessage(chatId, pesanPolos);
            return true;
        } catch (err2) {
            console.log("❌ Gagal kirim pesan:", err2.message);
            return false;
        }
    }
};

// ============================================
// --- CEK JOIN CHANNEL ---
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

// ============================================
// --- MENU ---
// ============================================
const tampilkanMenuUtama = (nama) => {
    return {
        text: `👑 *f-store* ✨\nProduk langganan digital premium otomatis.\n\nHalo *${nama}*! 🔥\n\n⬇️ *Pilih menu di bawah buat mulai:*`,
        options: {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('✦ Perpanjang Gemini Pro', 'bayar_gemini')],
                [Markup.button.callback('🎨 Canva Edu Pro', 'menu_canva')],
                [Markup.button.callback('📋 Riwayat & Status', 'cek_status'), Markup.button.callback('🔑 Kode Unik', 'input_kode')]
            ])
        }
    };
};

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
// --- /START ---
// ============================================
bot.start(async (ctx) => {
    const joined = await isUserJoined(ctx);
    if (!joined) {
        const fj = pesanForceJoin();
        return ctx.reply(fj.text, fj.options);
    }

    const { data } = await supabase.from('subscriptions').select('id').eq('telegram_id', ctx.from.id).limit(1);
    const menu = tampilkanMenuUtama(ctx.from.first_name);
    let pesanStart = menu.text;

    if (!data || data.length === 0) {
        pesanStart += `\n\n⚠️ _Jika kamu anggota Family Sharing (Gemini) lama, silakan klik tombol *🔑 Kode Unik* di bawah._`;
    }

    await ctx.reply(pesanStart, menu.options);
});

// --- Cek Join ---
bot.action('cek_join', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const joined = await isUserJoined(ctx);
    if (!joined) return ctx.answerCbQuery('⚠️ Kamu belum bergabung ke channel. Silakan gabung dulu ya!', { show_alert: true });

    try { await ctx.deleteMessage(); } catch (e) {}
    const menu = tampilkanMenuUtama(ctx.from.first_name);
    await ctx.reply(`🎉 *Verifikasi Berhasil!*\n\n` + menu.text, menu.options);
});

// --- Kode Unik ---
bot.action('input_kode', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await ctx.reply(
        '🔑 *Tautkan Akun*\n\nSilakan _Copy_ dan _Paste_ (Kirim) kode unik yang diberikan oleh Admin secara langsung ke obrolan ini 👇',
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Kembali', 'kembali_menu')]]) }
    );
});

// --- Deteksi Kode via Chat ---
bot.on('text', async (ctx) => {
    const text = ctx.message.text.trim().toUpperCase();
    if (text.startsWith('/')) return;

    if (text.length >= 5 && text.length <= 8) {
        const { data, error } = await supabase.from('subscriptions').select('*').eq('kode_sinkronisasi', text).maybeSingle();
        if (data) {
            if (data.telegram_id) return ctx.reply('⚠️ Kode ini sudah terpakai oleh akun Telegram lain.');
            await supabase.from('subscriptions').update({ telegram_id: ctx.from.id, kode_sinkronisasi: null }).eq('id', data.id);
            return ctx.reply(
                `✅ *Sinkronisasi Berhasil!*\n\nSelamat datang kembali, *${data.nama}*! Akun Telegram kamu telah terhubung dengan layanan *${data.layanan}*.\nKetik /start untuk membuka menu utama.`,
                { parse_mode: 'Markdown' }
            );
        }
    }
});

// ============================================
// --- PROTEKSI GEMINI ---
// ============================================
bot.action('bayar_gemini', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});

    try {
        const { data } = await supabase.from('subscriptions')
            .select('id')
            .eq('telegram_id', ctx.from.id)
            .ilike('layanan', '%Gemini%')
            .limit(1);

        if (!data || data.length === 0) {
            return ctx.reply(
                '⚠️ *Akses Ditolak!*\n\nLayanan *Gemini Pro* menggunakan sistem _Family Sharing_ (Stok Terbatas) dan tidak dijual secara publik.\n\nJika kamu sudah memesan ke Admin, silakan klik tombol *🔑 Kode Unik* di menu utama dan masukkan kodenya terlebih dahulu.',
                { parse_mode: 'Markdown' }
            );
        }

        await prosesTagihan(ctx, 'Gemini Pro (1 Bulan)', 15000, 'GEMINI1M', 'Gemini');
    } catch (err) {
        console.log("❌ Error di bayar_gemini:", err.message);
        await ctx.reply('❌ Terjadi kesalahan. Silakan coba lagi atau hubungi Admin.').catch(() => {});
    }
});

// --- Menu Canva ---
bot.action('menu_canva', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await ctx.editMessageText('🎨 *Pilih durasi Canva Edu Pro:*', {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('1 Bulan (Rp5.000)', 'canva_1m'), Markup.button.callback('3 Bulan (Rp13.000)', 'canva_3m')],
            [Markup.button.callback('6 Bulan (Rp25.000)', 'canva_6m'), Markup.button.callback('1 Tahun (Rp35.000)', 'canva_1y')],
            [Markup.button.callback('🔙 Kembali', 'kembali_menu')]
        ])
    });
});

bot.action('kembali_menu', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const menu = tampilkanMenuUtama(ctx.from.first_name);
    try { await ctx.editMessageText(menu.text, menu.options); } catch (e) {
        try { await ctx.deleteMessage(); } catch (e) {}
        await ctx.reply(menu.text, menu.options);
    }
});

// ============================================
// --- FUNGSI TAGIHAN (DENGAN PROTEKSI DATABASE) ---
// ============================================
const prosesTagihan = async (ctx, namaLayanan, hargaAsli, kodeLayanan, kategoriLayanan) => {
    console.log(`\n💳 prosesTagihan: ${namaLayanan} | User: ${ctx.from.id}`);

    try {
        await ctx.editMessageText(`⏳ _Sedang menyiapkan tagihan untuk ${namaLayanan}..._`, { parse_mode: 'Markdown' });
    } catch (e) {}

    const kodeUnik = Math.floor(Math.random() * 999) + 1;
    const totalBayar = hargaAsli + kodeUnik;
    const telegram_id = ctx.from.id;
    const order_id = `${kodeLayanan}-${telegram_id}-${Date.now()}`;

    // ============================================
    // STEP 1: Simpan order_id (DENGAN PROTEKSI ERROR SUPABASE)
    // ============================================
    try {
        const { data, error: selectErr } = await supabase.from('subscriptions')
            .select('id')
            .eq('telegram_id', telegram_id)
            .ilike('layanan', `%${kategoriLayanan}%`)
            .limit(1);

        if (selectErr) throw selectErr;

        if (!data || data.length === 0) {
            // Insert baris baru untuk produk yang belum dimiliki
            const { error: insertErr } = await supabase.from('subscriptions').insert([{
                telegram_id: telegram_id,
                nama: ctx.from.first_name,
                layanan: kategoriLayanan === 'Canva' ? 'Canva Pro' : 'Gemini Pro',
                status_aktif: false,
                nominal: totalBayar,
                last_order_id: order_id
            }]);
            
            if (insertErr) {
                console.log("❌ SUPABASE INSERT ERROR:", insertErr.message);
                throw new Error("Gagal menyimpan ke database (Cek constraint UNIQUE).");
            }
        } else {
            // Update baris produk yang sudah ada (Perpanjangan)
            const { error: updateErr } = await supabase.from('subscriptions')
                .update({ last_order_id: order_id, nominal: totalBayar })
                .eq('id', data[0].id);
            
            if (updateErr) {
                console.log("❌ SUPABASE UPDATE ERROR:", updateErr.message);
                throw new Error("Gagal mengupdate data pesanan di database.");
            }
        }
        console.log("✅ Order berhasil diamankan ke database");
    } catch (dbErr) {
        console.log("⚠️ Menghentikan proses karena DB Error:", dbErr.message);
        try { await ctx.deleteMessage(); } catch (e) {}
        return ctx.reply('❌ Sistem sedang sibuk. Gagal menyimpan sesi pesanan, silakan ulangi beberapa saat lagi atau hubungi Admin.');
    }

    // ============================================
    // STEP 2: Midtrans dengan timeout manual 
    // ============================================
    let qrisUrl = null;
    let midtransSuccess = false;

    try {
        console.log("🔄 Memanggil Midtrans...");
        const midtransPromise = coreApi.charge({
            "payment_type": "qris",
            "transaction_details": { "order_id": order_id, "gross_amount": totalBayar }
        });

        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Midtrans timeout 6 detik')), 6000)
        );

        const chargeResponse = await Promise.race([midtransPromise, timeoutPromise]);
        qrisUrl = chargeResponse?.actions?.[0]?.url;
        
        if (!qrisUrl) throw new Error('Midtrans tidak mengembalikan QRIS URL');
        
        midtransSuccess = true;
        console.log("✅ Midtrans sukses");
    } catch (error) {
        console.log(`⚠️ Midtrans gagal: ${error.message}`);
        console.log("🔄 Beralih ke Fallback QRIS...");
    }

    // ============================================
    // STEP 3: Kirim hasil (Midtrans atau Fallback)
    // ============================================
    try { await ctx.deleteMessage(); } catch (e) {}

    if (midtransSuccess && qrisUrl) {
        try {
            await ctx.replyWithPhoto(
                { url: qrisUrl },
                {
                    caption: `✅ *Tagihan Dibuat! (Otomatis)*\n\n🧾 *Order ID:* \`${order_id}\`\n💻 *Layanan:* ${namaLayanan}\n💰 *Total:* *Rp${totalBayar.toLocaleString('id-ID')}*\n\n_Sistem akan memverifikasi pembayaranmu secara otomatis._`,
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([[Markup.button.callback('❌ Batalkan Pesanan', 'batal_pesanan')]])
                }
            );
        } catch (sendErr) {
            midtransSuccess = false; // Gagal kirim foto, paksa ke fallback
        }
    }

    if (!midtransSuccess) {
        try {
            await ctx.replyWithPhoto(
                { url: QRIS_FALLBACK_URL },
                {
                    caption: `⚠️ _Sistem otomatis sedang maintenance. Mengalihkan ke jalur manual..._\n\n✅ *Tagihan Dibuat!*\n\n🧾 *Order ID:* \`${order_id}\`\n💻 *Layanan:* ${namaLayanan}\n💰 *Total Bayar:* *Rp${totalBayar.toLocaleString('id-ID')}*\n\n⚠️ *PENTING:* Transfer *TEPAT* sejumlah nominal di atas hingga 3 digit terakhir.\n\n_Setelah transfer, copy Order ID di atas & kirim ke Admin untuk verifikasi manual._`,
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([[Markup.button.callback('❌ Batalkan Pesanan', 'batal_pesanan')]])
                }
            );
        } catch (sendErr2) {
            try {
                await ctx.reply(`✅ Tagihan Dibuat!\n\nOrder ID: ${order_id}\nLayanan: ${namaLayanan}\nTotal: Rp ${totalBayar.toLocaleString('id-ID')}\n\nSistem sedang sibuk. Silakan kirim Order ID di atas ke Admin.`);
            } catch (finalErr) {}
        }
    }
};

bot.action('canva_1m', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await prosesTagihan(ctx, 'Canva Pro (1 Bulan)', 5000, 'CANVA1M', 'Canva');
});
bot.action('canva_3m', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await prosesTagihan(ctx, 'Canva Pro (3 Bulan)', 13000, 'CANVA3M', 'Canva');
});
bot.action('canva_6m', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await prosesTagihan(ctx, 'Canva Pro (6 Bulan)', 25000, 'CANVA6M', 'Canva');
});
bot.action('canva_1y', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await prosesTagihan(ctx, 'Canva Pro (1 Tahun)', 35000, 'CANVA1Y', 'Canva');
});

bot.action('batal_pesanan', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    try { await ctx.deleteMessage(); } catch (e) {}
    const menu = tampilkanMenuUtama(ctx.from.first_name);
    await ctx.reply('🚫 _Pembuatan tagihan telah dibatalkan._', menu.options);
});

// ============================================
// --- CEK STATUS (Multi-Produk) ---
// ============================================
bot.action('cek_status', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});

    const { data, error } = await supabase.from('subscriptions').select('*').eq('telegram_id', ctx.from.id);
    const tombolKembali = Markup.inlineKeyboard([[Markup.button.callback('🔙 Kembali', 'kembali_menu')]]);

    if (error || !data || data.length === 0) {
        return ctx.reply('⚠️ *Data Belum Ditemukan*\nSilakan klik tombol *🔑 Kode Unik* atau beli layanan.', { parse_mode: 'Markdown', ...tombolKembali });
    }

    let pesan = `📋 *RIWAYAT AKUN KAMU*\n👤 *Nama:* ${data[0].nama}\n━━━━━━━━━━━━━━━━━━\n\n`;

    let linkCanva = '';
    const adaCanva = data.some(item => (item.layanan || '').toLowerCase().includes('canva') && item.status_aktif);
    if (adaCanva) {
        const { data: setting } = await supabase.from('settings').select('nilai').eq('nama_pengaturan', 'link_canva').maybeSingle();
        if (setting?.nilai) linkCanva = setting.nilai;
    }

    data.forEach(item => {
        const statusPesan = item.status_aktif ? "✅ AKTIF" : "❌ BELUM BAYAR / HABIS";
        const formatTanggal = item.jatuh_tempo
            ? new Date(item.jatuh_tempo).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
            : '-';
        pesan += `💻 *${item.layanan}*\n🔖 Status: ${statusPesan}\n⏳ Tempo: ${formatTanggal}\n\n`;

        if ((item.layanan || '').toLowerCase().includes('canva') && item.status_aktif && linkCanva) {
            pesan += `🔗 Link: ${linkCanva}\n\n`;
        }
    });

    pesan += `━━━━━━━━━━━━━━━━━━\n_Semua status update otomatis._`;

    await ctx.reply(pesan, { parse_mode: 'Markdown', ...tombolKembali });
});

// ============================================
// --- WEBHOOK ---
// ============================================
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method === 'POST') {
        // Update dari Telegram
        if (req.body.message || req.body.callback_query) {
            try {
                await bot.handleUpdate(req.body);
            } catch (e) {
                console.log("Error handleUpdate:", e.message);
            }
            return res.status(200).send('OK');
        }

        // Update dari Dashboard Admin atau Midtrans
        if (req.body.transaction_status) {
            console.log("🔔 Webhook MASUK:", JSON.stringify(req.body));

            const status = req.body.transaction_status;
            const order_id = req.body.order_id;

            if (status === 'settlement' || status === 'capture') {
                try {
                    if (!order_id) {
                        console.log("❌ order_id kosong!");
                        return res.status(200).send('No order_id');
                    }

                    const parts = order_id.split('-');
                    const kodeLayanan = parts[0];
                    const telegram_id = parts[1];
                    const kategori = kodeLayanan.includes('CANVA') ? 'Canva' : 'Gemini';

                    console.log(`📦 Parsed: kode=${kodeLayanan}, telegram_id=${telegram_id}, kategori=${kategori}`);

                    // ============================================
                    // FIX: SEARCH BY last_order_id DULU (paling akurat)
                    // ============================================
                    let user = null;

                    // PRIMARY: Cari by last_order_id
                    const { data: byOrder } = await supabase
                        .from('subscriptions')
                        .select('id, nama, jatuh_tempo, nominal, layanan')
                        .eq('last_order_id', order_id)
                        .limit(1);

                    if (byOrder && byOrder.length > 0) {
                        user = byOrder[0];
                        console.log(`✅ User ditemukan by last_order_id: id=${user.id}, layanan=${user.layanan}`);
                    } else {
                        console.log(`⚠️ Tidak ditemukan by last_order_id. Coba fallback ke telegram_id + kategori...`);

                        // FALLBACK: Cari by telegram_id + ilike layanan
                        const { data: byTg } = await supabase
                            .from('subscriptions')
                            .select('id, nama, jatuh_tempo, nominal, layanan')
                            .eq('telegram_id', parseInt(telegram_id))
                            .ilike('layanan', `%${kategori}%`)
                            .order('id', { ascending: false })
                            .limit(1);

                        if (byTg && byTg.length > 0) {
                            user = byTg[0];
                            console.log(`✅ User ditemukan by telegram_id + kategori: id=${user.id}`);
                        }
                    }

                    if (!user) {
                        console.log(`❌ USER TIDAK DITEMUKAN! order_id=${order_id}, telegram_id=${telegram_id}, kategori=${kategori}`);
                        return res.status(200).send('User not found');
                    }

                    // ============================================
                    // Hitung durasi & nama layanan
                    // ============================================
                    let tambahanHari = 30;
                    let namaLayanan = 'Gemini Pro (1 Bulan)';

                    if (kodeLayanan === 'CANVA1M') { tambahanHari = 30; namaLayanan = 'Canva Pro (1 Bulan)'; }
                    if (kodeLayanan === 'CANVA3M') { tambahanHari = 90; namaLayanan = 'Canva Pro (3 Bulan)'; }
                    if (kodeLayanan === 'CANVA6M') { tambahanHari = 180; namaLayanan = 'Canva Pro (6 Bulan)'; }
                    if (kodeLayanan === 'CANVA1Y') { tambahanHari = 365; namaLayanan = 'Canva Pro (1 Tahun)'; }

                    // Hitung tanggal
                    let tanggalDasar = new Date();
                    if (user.jatuh_tempo && new Date(user.jatuh_tempo) > tanggalDasar) {
                        tanggalDasar = new Date(user.jatuh_tempo);
                    }
                    tanggalDasar.setDate(tanggalDasar.getDate() + tambahanHari);
                    const newJatuhTempo = tanggalDasar.toISOString().split('T')[0];

                    // Update database
                    const { error: updateErr } = await supabase
                        .from('subscriptions')
                        .update({ status_aktif: true, jatuh_tempo: newJatuhTempo })
                        .eq('id', user.id);

                    if (updateErr) {
                        console.log("❌ Update error:", updateErr.message);
                    } else {
                        console.log(`✅ DB updated untuk user id=${user.id}, jatuh tempo=${newJatuhTempo}`);
                    }

                    // ============================================
                    // Kirim notifikasi ke user
                    // ============================================
                    const totalBayar = user.nominal ? Number(user.nominal).toLocaleString('id-ID') : '-';
                    const tanggalFormatted = tanggalDasar.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

                    let teksLinkCanva = '';
                    if (kategori === 'Canva') {
                        const { data: setting } = await supabase
                            .from('settings')
                            .select('nilai')
                            .eq('nama_pengaturan', 'link_canva')
                            .maybeSingle();
                        if (setting?.nilai) {
                            teksLinkCanva = `\n\n🎨 *Akses Canva Pro Kamu:*\n${setting.nilai}\n_(Klik link untuk bergabung ke Tim)_`;
                        }
                    }

                    const pesanSukses =
                        `🎉 *PEMBAYARAN BERHASIL!*\n\n` +
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

                    console.log(`📨 Kirim pesan sukses ke telegram_id=${telegram_id}...`);
                    const sent = await safeSendMessage(parseInt(telegram_id), pesanSukses);
                    console.log(sent ? `✅ Terkirim ke ${telegram_id}` : `❌ GAGAL ke ${telegram_id}`);

                    // Broadcast ke channel
                    const idStr = telegram_id.toString();
                    const maskedId = idStr.substring(0, 3) + '•••' + idStr.substring(idStr.length - 3);
                    const amount = user.nominal ? Number(user.nominal).toLocaleString('id-ID') : '0';
                    const now = new Date();
                    const dateStr = now.toLocaleDateString('en-GB', { timeZone: 'Asia/Jakarta' });
                    const timeStr = now.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour12: false }).replace(/:/g, '.');

                    const broadcastPesan =
                        `📣 *New Purchase!*\n\n` +
                        `ℹ️ *ID:* ${maskedId}\n` +
                        `🛍️ *Product:* ${namaLayanan}\n` +
                        `✅ *Quantity:* 1\n` +
                        `💵 *Amount:* Rp ${amount}\n` +
                        `⏳ *Time:* ${dateStr}, ${timeStr}`;

                    try {
                        await bot.telegram.sendMessage(CHANNEL_USERNAME, broadcastPesan, { parse_mode: 'Markdown' });
                        console.log(`✅ Broadcast ke channel berhasil`);
                    } catch (e) {
                        console.log("❌ Gagal broadcast:", e.message);
                    }
                } catch (fatalErr) {
                    console.log("❌❌ FATAL ERROR:", fatalErr.message);
                    console.log(fatalErr.stack);
                }
            }
            return res.status(200).send('OK');
        }
    }
    res.status(200).send('Bot berjalan!');
}