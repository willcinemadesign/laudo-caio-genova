export const config = {
  maxDuration: 60
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const { prompt, images } = req.body;
    const BATCH_SIZE = 3;

    async function callGemini(promptText, imgs) {
      const parts = [{ text: promptText }];
      if (imgs && imgs.length > 0) {
        imgs.forEach(img => {
          parts.push({
            inline_data: {
              mime_type: img.mimeType || 'image/jpeg',
              data: img.data
            }
          });
        });
      }

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 65536
            }
          })
        }
      );

      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'Gemini API error');
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    // If no images or few images, call once
    if (!images || images.length <= BATCH_SIZE) {
      const text = await callGemini(prompt, images || []);
      return res.status(200).json({ text });
    }

    // Split images into batches
    const batches = [];
    for (let i = 0; i < images.length; i += BATCH_SIZE) {
      batches.push(images.slice(i, i + BATCH_SIZE));
    }

    // Call Gemini for each batch
    const results = [];
    for (let i = 0; i < batches.length; i++) {
      const batchPrompt = prompt + `\n\nAtenção: analise apenas as imagens ${i * BATCH_SIZE + 1} a ${Math.min((i + 1) * BATCH_SIZE, images.length)} neste lote.`;
      const text = await callGemini(batchPrompt, batches[i]);
      results.push(text);
    }

    const fullText = results.join('\n\n');
    return res.status(200).json({ text: fullText });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
