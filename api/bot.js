const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');

// Mengambil variabel dari Environment Vercel nanti
const bot = new Telegraf(process.env.BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// 1. Command /start untuk mendaftarkan temanmu ke database
bot.start(async (ctx) => {
  const telegram_id = ctx.from.id;
  const nama = ctx.from.first_name;
  
  // Menyimpan atau memperbarui data temanmu di tabel subscriptions
  const { error } = await supabase.from('subscriptions').upsert({ 
    telegram_id: telegram_id, 
    nama: nama,
    nominal: 15000 // Kamu bisa ubah default harganya di sini
  }, { onConflict: 'telegram_id' });

  if (error) {
    return ctx.reply('Terjadi kesalahan saat menyimpan data ke database.');
  }
  
  ctx.reply(`Halo ${nama}! Data kamu sudah terdaftar. Ketik /bayar untuk memperpanjang akses langganan.`);
});

// 2. Command /bayar untuk meminta tagihan
bot.command('bayar', async (ctx) => {
  // Logika pembuatan QRIS dari Payment Gateway akan diletakkan di sini nantinya
  ctx.reply('Fitur pembayaran sedang disiapkan. Nanti link atau gambar QRIS akan muncul di sini!');
});

// 3. Command /rekap untuk melihat siapa saja yang sudah bayar (seperti query Eloquent di Laravel)
bot.command('rekap', async (ctx) => {
  const { data, error } = await supabase.from('subscriptions').select('*');
  
  if (error) return ctx.reply('Gagal mengambil data rekap dari database.');
  
  let pesan = "📋 *REKAP LANGGANAN BULAN INI*\n\n";
  data.forEach(user => {
    const status = user.status_aktif ? "✅ Lunas" : "❌ Belum Bayar";
    pesan += `- ${user.nama}: ${status}\n`;
  });
  
  ctx.replyWithMarkdown(pesan);
});

// 4. Handler Endpoint untuk Vercel (Bertindak seperti Controller/Routes)
export default async function handler(req, res) {
  if (req.method === 'POST') {
    
    // A. Menangani pesan yang masuk dari Telegram
    if (req.body.message || req.body.callback_query) {
      await bot.handleUpdate(req.body);
      return res.status(200).send('OK');
    }
    
    // B. Menangani webhook dari Payment Gateway (saat temanmu selesai bayar QRIS)
    if (req.body.status === 'PAID') {
       const telegram_id = req.body.merchant_ref; // Nama variabel menyesuaikan Payment Gateway
       
       // Update status_aktif di Supabase menjadi true
       await supabase.from('subscriptions')
         .update({ status_aktif: true })
         .eq('telegram_id', telegram_id);
         
       // Kirim notifikasi otomatis ke bot temanmu
       await bot.telegram.sendMessage(telegram_id, '✅ Pembayaran berhasil diterima! Akses diperpanjang 30 hari.');
       return res.status(200).send('OK');
    }
  }
  
  // Jika endpoint diakses melalui browser biasa
  res.status(200).send('Endpoint Bot Webhook Aktif!');
}