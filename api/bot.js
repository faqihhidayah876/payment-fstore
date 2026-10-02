const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const midtransClient = require('midtrans-client');

const bot = new Telegraf(process.env.BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Konfigurasi Midtrans (Ganti isProduction menjadi true jika nanti sudah disetujui Midtrans)
let snap = new midtransClient.Snap({
    isProduction : false,
    serverKey : process.env.MIDTRANS_SERVER_KEY
});

// 1. Command /start
bot.start(async (ctx) => {
  const telegram_id = ctx.from.id;
  const nama = ctx.from.first_name;
  
  await supabase.from('subscriptions').upsert({ 
    telegram_id: telegram_id, 
    nama: nama,
    nominal: 15000 
  }, { onConflict: 'telegram_id' });
  
  ctx.reply(`Halo ${nama}! Ketik /bayar untuk memperpanjang akses Gemini Pro.`);
});

// 2. Command /bayar (Membuat tagihan Midtrans)
bot.command('bayar', async (ctx) => {
  const telegram_id = ctx.from.id;
  const order_id = `GEMINI-${telegram_id}-${Date.now()}`; // ID unik per transaksi
  
  let parameter = {
      "transaction_details": {
          "order_id": order_id,
          "gross_amount": 15000
      },
      "customer_details": {
          "first_name": ctx.from.first_name
      }
  };

  try {
      const transaction = await snap.createTransaction(parameter);
      ctx.reply(`Silakan selesaikan pembayaran kamu melalui link berikut (Bisa pakai QRIS/GoPay):\n\n${transaction.redirect_url}\n\n*Akses otomatis diperpanjang setelah dibayar.*`);
  } catch (error) {
      ctx.reply('Maaf, sistem pembayaran sedang gangguan.');
  }
});

// 3. Command /rekap
bot.command('rekap', async (ctx) => {
  const { data, error } = await supabase.from('subscriptions').select('*');
  if (error) return ctx.reply('Gagal mengambil data.');
  
  let pesan = "📋 *REKAP LANGGANAN BULAN INI*\n\n";
  data.forEach(user => {
    pesan += `- ${user.nama}: ${user.status_aktif ? "✅ Lunas" : "❌ Belum Bayar"}\n`;
  });
  ctx.replyWithMarkdown(pesan);
});

// 4. Handler Webhook Vercel (Telegram & Midtrans)
export default async function handler(req, res) {
  if (req.method === 'POST') {
    
    // A. Request dari Telegram
    if (req.body.message || req.body.callback_query) {
      await bot.handleUpdate(req.body);
      return res.status(200).send('OK');
    }
    
    // B. Request Webhook dari Midtrans (Notifikasi Pembayaran)
    if (req.body.transaction_status) {
       const status = req.body.transaction_status;
       const order_id = req.body.order_id; 
       
       // Midtrans menganggap sukses jika statusnya settlement atau capture
       if (status === 'settlement' || status === 'capture') {
           // Ekstrak telegram_id dari order_id (GEMINI-12345678-timestamp)
           const telegram_id = order_id.split('-')[1]; 
           
           await supabase.from('subscriptions')
             .update({ status_aktif: true })
             .eq('telegram_id', parseInt(telegram_id));
             
           await bot.telegram.sendMessage(telegram_id, '✅ Pembayaran berhasil diterima! Akses Gemini Pro diperpanjang 30 hari.');
       }
       return res.status(200).send('OK');
    }
  }
  res.status(200).send('Bot berjalan!');
}