const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const midtransClient = require('midtrans-client');

const bot = new Telegraf(process.env.BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Menggunakan Core API agar bisa mendapatkan gambar QRIS langsung
let coreApi = new midtransClient.CoreApi({
    isProduction : false,
    serverKey : process.env.MIDTRANS_SERVER_KEY
});

// --- FUNGSI MENU UTAMA ---
const tampilkanMenuUtama = (nama) => {
    return {
        text: `👑 *F-Store* ✨\nProduk digital premium. Pengiriman instan otomatis.\n\nHalo *${nama}*! 🔥\n\n⬇️ Pilih menu di bawah buat mulai:`,
        options: {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🛒 Beli Produk', 'menu_beli')],
                [Markup.button.callback('😃 Profil', 'menu_profil'), Markup.button.callback('📜 Pesanan', 'menu_pesanan')],
                [Markup.button.callback('💬 Bantuan', 'menu_bantuan')]
            ])
        }
    };
};

// 1. Command /start
bot.start(async (ctx) => {
    const nama = ctx.from.first_name;
    const telegram_id = ctx.from.id;
    
    // Simpan user ke database saat pertama kali start
    await supabase.from('subscriptions').upsert({ 
        telegram_id: telegram_id, 
        nama: nama,
        nominal: 16000 
    }, { onConflict: 'telegram_id' });

    const menu = tampilkanMenuUtama(nama);
    await ctx.reply(menu.text, menu.options);
});

// 2. Handler Tombol "Beli Produk"
bot.action('menu_beli', async (ctx) => {
    await ctx.editMessageText('🛍️ *Silakan pilih produk yang ingin Anda beli:*', {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('❌ Adobe Express 12M (HABIS)', 'habis')],
            [Markup.button.callback('📦 Gemini Pro 18Months - Rp16,000', 'beli_gemini')],
            [Markup.button.callback('🔙 Kembali', 'kembali_menu')]
        ])
    });
});

// 3. Handler Tombol "Kembali"
bot.action('kembali_menu', async (ctx) => {
    const menu = tampilkanMenuUtama(ctx.from.first_name);
    await ctx.editMessageText(menu.text, menu.options);
});

// 4. Handler Fitur Belum Tersedia (Profil, Pesanan, Bantuan, Habis)
bot.action(['menu_profil', 'menu_pesanan', 'menu_bantuan', 'habis'], async (ctx) => {
    await ctx.answerCbQuery('Fitur ini sedang dalam pengembangan! 🛠️', { show_alert: true });
});

// 5. Handler Proses Pembelian (Generate QRIS Asli)
bot.action('beli_gemini', async (ctx) => {
    // Memberikan efek loading
    await ctx.editMessageText('⏳ _Sedang membuatkan QRIS untukmu..._', { parse_mode: 'Markdown' });

    const telegram_id = ctx.from.id;
    const order_id = `GEMINI-${telegram_id}-${Date.now()}`; 
    
    let parameter = {
        "payment_type": "qris",
        "transaction_details": {
            "order_id": order_id,
            "gross_amount": 16000
        }
    };

    try {
        // Tembak Midtrans Core API
        const chargeResponse = await coreApi.charge(parameter);
        
        // Midtrans Core API mengembalikan URL gambar QRIS di dalam array 'actions'
        const qrisUrl = chargeResponse.actions[0].url; 
        
        // Hapus pesan loading dan kirim gambar QRIS langsung
        await ctx.deleteMessage();
        await ctx.replyWithPhoto(
            { url: qrisUrl }, 
            { caption: `✅ *Tagihan Dibuat!*\n\n📦 *Produk:* Gemini Pro 18Months\n💰 *Total:* Rp16.000\n\nSilakan _scan_ gambar QRIS ini menggunakan GoPay, OVO, Dana, atau Mobile Banking kamu.\n_Akses akan otomatis dikirimkan ke sini setelah pembayaran berhasil._`, parse_mode: 'Markdown' }
        );
    } catch (error) {
        await ctx.reply('❌ Maaf, sistem pembayaran sedang gangguan. Coba lagi nanti.');
    }
});

// 6. Handler Webhook Vercel & Midtrans
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
           
           await supabase.from('subscriptions')
             .update({ status_aktif: true })
             .eq('telegram_id', parseInt(telegram_id));
             
           await bot.telegram.sendMessage(telegram_id, '🎉 *Pembayaran Berhasil!*\n\nTerima kasih, akses Gemini Pro 18 Bulan kamu sudah aktif. Berikut adalah detail akun kamu: _[Kirim detail produk di sini]_', { parse_mode: 'Markdown' });
       }
       return res.status(200).send('OK');
    }
  }
  res.status(200).send('Bot berjalan!');
}