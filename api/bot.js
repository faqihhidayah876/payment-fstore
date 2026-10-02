const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const midtransClient = require('midtrans-client');

const bot = new Telegraf(process.env.BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const coreApi = new midtransClient.CoreApi({
    isProduction : false,
    serverKey : process.env.MIDTRANS_SERVER_KEY
});

// --- MENU UTAMA (PORTAL LANGGANAN) ---
const tampilkanMenuUtama = (nama) => {
    return {
        text: `Halo *${nama}*! 👋\n\nSelamat datang di *Portal Langganan Premium*.\nSilakan pilih layanan yang ingin kamu perpanjang bulan ini:`,
        options: {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('✨ Perpanjang Gemini Pro', 'bayar_gemini')],
                [Markup.button.callback('🎨 Perpanjang Canva Pro', 'bayar_canva')],
                [Markup.button.callback('📋 Cek Status & Tagihan', 'cek_status')]
            ])
        }
    };
};

// 1. Command /start
bot.start(async (ctx) => {
    const nama = ctx.from.first_name;
    const telegram_id = ctx.from.id;
    
    // Simpan data kontak teman ke database
    await supabase.from('subscriptions').upsert({ 
        telegram_id: telegram_id, 
        nama: nama
    }, { onConflict: 'telegram_id' });

    const menu = tampilkanMenuUtama(nama);
    await ctx.reply(menu.text, menu.options);
});

// --- FUNGSI GENERATE QRIS DINAMIS ---
// Dibuat menjadi fungsi terpisah agar bisa dipakai untuk Gemini maupun Canva
const prosesTagihan = async (ctx, namaLayanan, harga, kodeLayanan) => {
    // Edit pesan menu menjadi loading
    await ctx.editMessageText(`⏳ _Sedang menyiapkan tagihan QRIS untuk ${namaLayanan}..._`, { parse_mode: 'Markdown' });

    const telegram_id = ctx.from.id;
    const order_id = `${kodeLayanan}-${telegram_id}-${Date.now()}`; 
    
    let parameter = {
        "payment_type": "qris",
        "transaction_details": {
            "order_id": order_id,
            "gross_amount": harga
        }
    };

    try {
        const chargeResponse = await coreApi.charge(parameter);
        const qrisUrl = chargeResponse.actions[0].url; 
        
        // Hapus teks loading
        await ctx.deleteMessage();
        
        // Kirim gambar QRIS dengan tombol Batal
        await ctx.replyWithPhoto(
            { url: qrisUrl }, 
            { 
                caption: `✅ *Tagihan Dibuat!*\n\n💻 *Layanan:* ${namaLayanan}\n💰 *Total:* Rp${harga.toLocaleString('id-ID')}\n\nSilakan _scan_ gambar QRIS ini menggunakan m-Banking atau E-Wallet.\n_Akses akan diperpanjang 30 hari otomatis setelah lunas._`, 
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('❌ Batalkan Pesanan', 'batal_pesanan')]
                ])
            }
        );
    } catch (error) {
        await ctx.reply('❌ Sistem pembayaran sedang sibuk. Silakan coba beberapa saat lagi.');
    }
};

// 2. Handler Pilihan Layanan
bot.action('bayar_gemini', (ctx) => prosesTagihan(ctx, 'Gemini Pro (1 Bulan)', 15000, 'GEMINI'));
bot.action('bayar_canva', (ctx) => prosesTagihan(ctx, 'Canva Pro (1 Bulan)', 20000, 'CANVA')); // Sesuaikan harga Canva di sini

// 3. Handler Tombol Batalkan Pesanan
bot.action('batal_pesanan', async (ctx) => {
    // Menghapus gambar QRIS dari layar chat
    await ctx.deleteMessage();
    
    // Mengirim kembali menu utama
    const menu = tampilkanMenuUtama(ctx.from.first_name);
    await ctx.reply('🚫 _Pembuatan tagihan telah dibatalkan._\n\nJika butuh bantuan atau ingin memilih ulang, silakan gunakan menu di bawah ini:', menu.options);
});

// 4. Handler Cek Status (Bisa dikembangkan nanti untuk narik data Supabase)
bot.action('cek_status', async (ctx) => {
    await ctx.answerCbQuery('Data tagihan kamu sudah lunas bulan ini! ✅', { show_alert: true });
});

// 5. Handler Webhook Vercel & Midtrans
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
           const layanan = parts[0]; // GEMINI atau CANVA
           const telegram_id = parts[1]; 
           
           await supabase.from('subscriptions')
             .update({ status_aktif: true })
             .eq('telegram_id', parseInt(telegram_id));
             
           await bot.telegram.sendMessage(
               telegram_id, 
               `🎉 *Pembayaran Lunas!*\n\nTerima kasih, tagihan *${layanan}* kamu bulan ini sudah masuk. Akses langsung diperpanjang!`, 
               { parse_mode: 'Markdown' }
           );
       }
       return res.status(200).send('OK');
    }
  }
  res.status(200).send('Bot berjalan!');
}