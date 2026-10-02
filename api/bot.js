const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const midtransClient = require('midtrans-client');

const bot = new Telegraf(process.env.BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const coreApi = new midtransClient.CoreApi({
    isProduction : false,
    serverKey : process.env.MIDTRANS_SERVER_KEY
});

// --- MENU UTAMA ---
const tampilkanMenuUtama = (nama) => {
    return {
        text: `Halo *${nama}*! 👋\n\nSelamat datang di *Portal Langganan Premium*.\nSilakan pilih layanan yang ingin kamu perpanjang:`,
        options: {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('✨ Perpanjang Gemini Pro', 'bayar_gemini')],
                [Markup.button.callback('🎨 Perpanjang Canva Pro', 'menu_canva')],
                [Markup.button.callback('📋 Riwayat & Status Akun', 'cek_status')]
            ])
        }
    };
};

// 1. Command /start
bot.start(async (ctx) => {
    const telegram_id = ctx.from.id;
    const nama = ctx.from.first_name;
    
    // Cek apakah user sudah terdaftar berdasarkan telegram_id
    const { data } = await supabase.from('subscriptions').select('*').eq('telegram_id', telegram_id).single();
    
    // Jika belum ada, buat entri baru untuknya
    if (!data) {
        await supabase.from('subscriptions').insert([{ telegram_id: telegram_id, nama: nama, status_aktif: false }]);
    }

    const menu = tampilkanMenuUtama(nama);
    await ctx.reply(menu.text, menu.options);
});

// --- MENU CANVA (Pilihan Harga) ---
bot.action('menu_canva', async (ctx) => {
    await ctx.editMessageText('🎨 *Pilih durasi perpanjangan Canva Pro:*', {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('1 Bulan (Rp5.000)', 'canva_1m')],
            [Markup.button.callback('3 Bulan (Rp13.000)', 'canva_3m')],
            [Markup.button.callback('6 Bulan (Rp25.000)', 'canva_6m')],
            [Markup.button.callback('1 Tahun (Rp35.000)', 'canva_1y')],
            [Markup.button.callback('🔙 Kembali', 'kembali_menu')]
        ])
    });
});

// Kembalikan ke menu utama
bot.action('kembali_menu', async (ctx) => {
    const menu = tampilkanMenuUtama(ctx.from.first_name);
    await ctx.editMessageText(menu.text, menu.options);
});

// --- FUNGSI GENERATE QRIS DENGAN KODE UNIK ---
const prosesTagihan = async (ctx, namaLayanan, hargaAsli, kodeLayanan) => {
    await ctx.editMessageText(`⏳ _Sedang menyiapkan tagihan QRIS untuk ${namaLayanan}..._`, { parse_mode: 'Markdown' });

    // Membuat kode unik 3 digit acak (1 - 999)
    const kodeUnik = Math.floor(Math.random() * 999) + 1;
    const totalBayar = hargaAsli + kodeUnik; // Contoh: 15000 + 345 = 15345

    const telegram_id = ctx.from.id;
    const order_id = `${kodeLayanan}-${telegram_id}-${Date.now()}`; 
    
    let parameter = {
        "payment_type": "qris",
        "transaction_details": {
            "order_id": order_id,
            "gross_amount": totalBayar // Mengirim harga yang sudah ditambah kode unik
        }
    };

    try {
        const chargeResponse = await coreApi.charge(parameter);
        const qrisUrl = chargeResponse.actions[0].url; 
        
        await ctx.deleteMessage();
        await ctx.replyWithPhoto(
            { url: qrisUrl }, 
            { 
                caption: `✅ *Tagihan Dibuat!*\n\n💻 *Layanan:* ${namaLayanan}\n💰 *Total:* *Rp${totalBayar.toLocaleString('id-ID')}* _(Terdapat kode unik)_\n\nSilakan _scan_ gambar QRIS ini menggunakan E-Wallet pilihanmu.`, 
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([[Markup.button.callback('❌ Batalkan Pesanan', 'batal_pesanan')]])
            }
        );
    } catch (error) {
        await ctx.reply('❌ Sistem pembayaran sedang sibuk. Silakan coba beberapa saat lagi.');
    }
};

// Routing Tombol Pembayaran
bot.action('bayar_gemini', (ctx) => prosesTagihan(ctx, 'Gemini Pro (1 Bulan)', 15000, 'GEMINI'));
bot.action('canva_1m', (ctx) => prosesTagihan(ctx, 'Canva Pro (1 Bulan)', 5000, 'CANVA1M'));
bot.action('canva_3m', (ctx) => prosesTagihan(ctx, 'Canva Pro (3 Bulan)', 13000, 'CANVA3M'));
bot.action('canva_6m', (ctx) => prosesTagihan(ctx, 'Canva Pro (6 Bulan)', 25000, 'CANVA6M'));
bot.action('canva_1y', (ctx) => prosesTagihan(ctx, 'Canva Pro (1 Tahun)', 35000, 'CANVA1Y'));

bot.action('batal_pesanan', async (ctx) => {
    await ctx.deleteMessage();
    const menu = tampilkanMenuUtama(ctx.from.first_name);
    await ctx.reply('🚫 _Pembuatan tagihan telah dibatalkan._', menu.options);
});

// --- CEK STATUS & RIWAYAT DARI SUPABASE ---
bot.action('cek_status', async (ctx) => {
    const telegram_id = ctx.from.id;
    const { data, error } = await supabase.from('subscriptions').select('*').eq('telegram_id', telegram_id).single();

    if (error || !data || !data.layanan) {
        return ctx.reply('⚠️ *Data Belum Ditemukan*\nSepertinya akun Telegram kamu belum dihubungkan dengan data undangan (Family Sharing) dari Admin. Silakan hubungi Admin untuk menghubungkan ID ini.', { parse_mode: 'Markdown' });
    }

    const statusPesan = data.status_aktif ? "✅ LUNAS" : "❌ BELUM BAYAR";
    const pesan = `📋 *RIWAYAT AKUN KAMU*\n\n👤 *Nama Terdaftar:* ${data.nama}\n📧 *Email Induk:* ${data.email_family}\n💻 *Layanan:* ${data.layanan}\n🔖 *Status Tagihan:* ${statusPesan}`;
    
    await ctx.reply(pesan, { parse_mode: 'Markdown' });
});

// Webhook Vercel
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
           const telegram_id = order_id.split('-')[1]; 
           await supabase.from('subscriptions').update({ status_aktif: true }).eq('telegram_id', parseInt(telegram_id));
           await bot.telegram.sendMessage(telegram_id, '🎉 *Pembayaran Lunas!*\nAkses kamu sudah otomatis diperpanjang.', { parse_mode: 'Markdown' });
       }
       return res.status(200).send('OK');
    }
  }
  res.status(200).send('Bot berjalan!');
}