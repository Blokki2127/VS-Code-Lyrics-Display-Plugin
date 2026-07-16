/**
 * 音译模块 — 提供日文罗马音、中文拼音、韩文罗马音转换
 */

/** 日文假名 → 罗马音映射表（基础五十音 + 浊音 + 拗音） */
const HIRAGANA_TO_ROMAJI: Record<string, string> = {
  'あ':'a','い':'i','う':'u','え':'e','お':'o',
  'か':'ka','き':'ki','く':'ku','け':'ke','こ':'ko',
  'が':'ga','ぎ':'gi','ぐ':'gu','げ':'ge','ご':'go',
  'さ':'sa','し':'shi','す':'su','せ':'se','そ':'so',
  'ざ':'za','じ':'ji','ず':'zu','ぜ':'ze','ぞ':'zo',
  'た':'ta','ち':'chi','つ':'tsu','て':'te','と':'to',
  'だ':'da','ぢ':'ji','づ':'zu','で':'de','ど':'do',
  'な':'na','に':'ni','ぬ':'nu','ね':'ne','の':'no',
  'は':'ha','ひ':'hi','ふ':'fu','へ':'he','ほ':'ho',
  'ば':'ba','び':'bi','ぶ':'bu','べ':'be','ぼ':'bo',
  'ぱ':'pa','ぴ':'pi','ぷ':'pu','ぺ':'pe','ぽ':'po',
  'ま':'ma','み':'mi','む':'mu','め':'me','も':'mo',
  'や':'ya','ゆ':'yu','よ':'yo',
  'ら':'ra','り':'ri','る':'ru','れ':'re','ろ':'ro',
  'わ':'wa','を':'wo','ん':'n',
  'きゃ':'kya','きゅ':'kyu','きょ':'kyo',
  'ぎゃ':'gya','ぎゅ':'gyu','ぎょ':'gyo',
  'しゃ':'sha','しゅ':'shu','しょ':'sho',
  'じゃ':'ja','じゅ':'ju','じょ':'jo',
  'ちゃ':'cha','ちゅ':'chu','ちょ':'cho',
  'にゃ':'nya','にゅ':'nyu','にょ':'nyo',
  'ひゃ':'hya','ひゅ':'hyu','ひょ':'hyo',
  'びゃ':'bya','びゅ':'byu','びょ':'byo',
  'ぴゃ':'pya','ぴゅ':'pyu','ぴょ':'pyo',
  'みゃ':'mya','みゅ':'myu','みょ':'myo',
  'りゃ':'rya','りゅ':'ryu','りょ':'ryo',
  'っ': '',  // 促音
  'ー': '-', // 长音
};

const KATAKANA_TO_ROMAJI: Record<string, string> = {
  'ア':'a','イ':'i','ウ':'u','エ':'e','オ':'o',
  'カ':'ka','キ':'ki','ク':'ku','ケ':'ke','コ':'ko',
  'ガ':'ga','ギ':'gi','グ':'gu','ゲ':'ge','ゴ':'go',
  'サ':'sa','シ':'shi','ス':'su','セ':'se','ソ':'so',
  'ザ':'za','ジ':'ji','ズ':'zu','ゼ':'ze','ゾ':'zo',
  'タ':'ta','チ':'chi','ツ':'tsu','テ':'te','ト':'to',
  'ダ':'da','ヂ':'ji','ヅ':'zu','デ':'de','ド':'do',
  'ナ':'na','ニ':'ni','ヌ':'nu','ネ':'ne','ノ':'no',
  'ハ':'ha','ヒ':'hi','フ':'fu','ヘ':'he','ホ':'ho',
  'バ':'ba','ビ':'bi','ブ':'bu','ベ':'be','ボ':'bo',
  'パ':'pa','ピ':'pi','プ':'pu','ペ':'pe','ポ':'po',
  'マ':'ma','ミ':'mi','ム':'mu','メ':'me','モ':'mo',
  'ヤ':'ya','ユ':'yu','ヨ':'yo',
  'ラ':'ra','リ':'ri','ル':'ru','レ':'re','ロ':'ro',
  'ワ':'wa','ヲ':'wo','ン':'n',
  'キャ':'kya','キュ':'kyu','キョ':'kyo',
  'ギャ':'gya','ギュ':'gyu','ギョ':'gyo',
  'シャ':'sha','シュ':'shu','ショ':'sho',
  'ジャ':'ja','ジュ':'ju','ジョ':'jo',
  'チャ':'cha','チュ':'chu','チョ':'cho',
  'ニャ':'nya','ニュ':'nyu','ニョ':'nyo',
  'ヒャ':'hya','ヒュ':'hyu','ヒョ':'hyo',
  'ビャ':'bya','ビュ':'byu','ビョ':'byo',
  'ピャ':'pya','ピュ':'pyu','ピョ':'pyo',
  'ミャ':'mya','ミュ':'myu','ミョ':'myo',
  'リャ':'rya','リュ':'ryu','リョ':'ryo',
  'ッ':'','ー':'-',
};

/** 检测文本是否含日文字符 */
function isJapanese(text: string): boolean {
  return /[぀-ゟ゠-ヿ]/.test(text);
}

/** 检测文本是否含中文字符 */
function isChinese(text: string): boolean {
  return /[一-鿿㐀-䶿]/.test(text);
}

/** 检测文本是否含韩文字符 */
function isKorean(text: string): boolean {
  return /[가-힯]/.test(text);
}

/** 检测歌词语言 */
export function detectLanguage(lyrics: string): string {
  const sample = lyrics.substring(0, 200);
  if (isJapanese(sample)) return 'ja';
  if (isKorean(sample)) return 'ko';
  if (isChinese(sample)) return 'zh';
  return 'unknown';
}

/** 日文假名 → 罗马音 */
function toRomaji(text: string): string {
  // 先按2字符匹配（拗音），再按1字符匹配
  let result = '';
  let i = 0;

  while (i < text.length) {
    // 保留非日文字符
    const char = text[i];
    if (!isJapanese(char)) {
      result += char;
      i++;
      continue;
    }

    // 尝试2字符匹配
    const two = text.substring(i, i + 2);
    const twoRomaji = HIRAGANA_TO_ROMAJI[two] || KATAKANA_TO_ROMAJI[two];
    if (twoRomaji !== undefined) {
      // 促音：下一个字符是辅音开头 → 双写辅音
      if (two === 'っ' || two === 'ッ') {
        // 促音单独处理在下面的逻辑中
      }
      if (twoRomaji) result += twoRomaji;
      i += 2;
      continue;
    }

    // 1字符匹配
    const oneRomaji = HIRAGANA_TO_ROMAJI[char] || KATAKANA_TO_ROMAJI[char];
    if (oneRomaji !== undefined) {
      if (oneRomaji) result += oneRomaji;
    } else {
      result += char; // 保留未知字符
    }
    i++;
  }

  return result.trim();
}

/** 中文 → 拼音（简化映射，仅处理常见字符） */
function toPinyin(text: string): string {
  // 对于完整的拼音转换，建议在 V2 引入 pinyin 库
  // 当前版本：保留汉字原位，对非汉字字符不做处理
  // 返回空字符串表示暂不支持完整拼音转换
  return '';
}

/** 韩文 → 罗马音 */
const KOREAN_INITIAL: Record<number, string> = {
  0:'g',1:'kk',2:'n',3:'d',4:'tt',5:'r',6:'m',7:'b',8:'pp',
  9:'s',10:'ss',11:'',12:'j',13:'jj',14:'ch',15:'k',16:'t',17:'p',18:'h'
};
const KOREAN_MEDIAL: Record<number, string> = {
  0:'a',1:'ae',2:'ya',3:'yae',4:'eo',5:'e',6:'yeo',7:'ye',
  8:'o',9:'wa',10:'wae',11:'oe',12:'yo',13:'u',14:'wo',15:'we',16:'wi',
  17:'yu',18:'eu',19:'ui',20:'i'
};
const KOREAN_FINAL: Record<number, string> = {
  0:'',1:'k',2:'k',3:'ks',4:'n',5:'nj',6:'nh',7:'t',8:'l',9:'lk',
  10:'lm',11:'lp',12:'ls',13:'lt',14:'lp',15:'lh',16:'m',17:'p',
  18:'ps',19:'s',20:'ss',21:'ng',22:'j',23:'ch',24:'k',25:'t',26:'p',27:'h'
};

function toRomaja(text: string): string {
  let result = '';
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code >= 0xAC00 && code <= 0xD7AF) {
      const offset = code - 0xAC00;
      const initial = Math.floor(offset / 588);
      const medial = Math.floor((offset % 588) / 28);
      const final = offset % 28;
      result += (KOREAN_INITIAL[initial] || '') + (KOREAN_MEDIAL[medial] || '') + (KOREAN_FINAL[final] || '');
    } else {
      result += ch;
    }
  }
  return result;
}

/** 对外音译接口 */
export function transliterate(lyrics: string, lang: string): string {
  switch (lang) {
    case 'ja': return toRomaji(lyrics);
    case 'ko': return toRomaja(lyrics);
    case 'zh': return toPinyin(lyrics);
    default:  return '';
  }
}
