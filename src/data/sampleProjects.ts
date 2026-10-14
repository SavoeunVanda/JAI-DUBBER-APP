import { DemoVideo } from '../types';

export const SAMPLE_VIDEOS: DemoVideo[] = [
  {
    id: 'tech-ai',
    title: 'AI Technology Overview',
    titleKhmer: 'បច្ចេកវិទ្យា AI និងការផ្លាស់ប្តូរពិភពលោក',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    duration: 15.0,
    aspectRatio: '16:9',
    defaultSubtitles: [
      {
        startTime: 0.5,
        endTime: 4.2,
        text: 'សូមស្វាគមន៍មកកាន់ពិភពបច្ចេកវិទ្យាបញ្ញាសិប្បនិម្មិត AI',
        originalText: 'Welcome to the world of Artificial Intelligence technology',
        voiceProfile: 'km-KH-PisethNeural',
        gender: 'male',
        speed: 1.0,
      },
      {
        startTime: 4.5,
        endTime: 8.8,
        text: 'កម្មវិធី JAI DUBBER ជួយលោកអ្នកធ្វើការបញ្ចូលសំឡេងភាសាខ្មែរបានភ្លាមៗ',
        originalText: 'JAI DUBBER application helps you synthesize Khmer dubbing instantly',
        voiceProfile: 'km-KH-SreymomNeural',
        gender: 'female',
        speed: 1.0,
      },
      {
        startTime: 9.0,
        endTime: 14.5,
        text: 'ប្រើប្រាស់ Edge TTS និង Gemini AI ដើម្បីកែសម្រួលអត្ថបទ និងបញ្ចូលសំឡេងបែបធម្មជាតិ',
        originalText: 'Using Edge TTS and Gemini AI to edit transcripts and generate natural speech',
        voiceProfile: 'km-KH-PisethNeural',
        gender: 'male',
        speed: 1.0,
      }
    ]
  },
  {
    id: 'nature-doc',
    title: 'Nature Documentary (Big Buck)',
    titleKhmer: 'ឯកសារធម្មជាតិ និងសត្វព្រៃ',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    duration: 30.0,
    aspectRatio: '16:9',
    defaultSubtitles: [
      {
        startTime: 1.0,
        endTime: 6.0,
        text: 'នៅព្រឹកព្រលឹមនៃព្រៃខៀវស្រងាត់ សត្វទន្សាយធំបានភ្ញាក់ពីដំណេក',
        originalText: 'In the early morning of the lush forest, the big bunny woke up',
        voiceProfile: 'km-KH-PisethNeural',
        gender: 'male',
        speed: 1.0,
      },
      {
        startTime: 6.5,
        endTime: 12.0,
        text: 'វារីករាយនឹងខ្យល់អាកាសបរិសុទ្ធ និងមេអំបៅដែលហោះជុំវិញ',
        originalText: 'Enjoying the fresh air and butterflies flying around',
        voiceProfile: 'km-KH-SreymomNeural',
        gender: 'female',
        speed: 1.0,
      },
      {
        startTime: 12.5,
        endTime: 18.5,
        text: 'រាល់សកម្មភាពទាំងអស់ត្រូវបកប្រែ និងបញ្ចូលសំឡេងជាភាសាខ្មែរយ៉ាងច្បាស់',
        originalText: 'Every action is translated and dubbed into Khmer clearly',
        voiceProfile: 'km-KH-PisethNeural',
        gender: 'male',
        speed: 1.0,
      }
    ]
  },
  {
    id: 'cyber-scifi',
    title: 'Cyberpunk Sci-Fi Teaser',
    titleKhmer: 'វីដេអូខ្លី បច្ចេកវិទ្យាអនាគត',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
    duration: 25.0,
    aspectRatio: '16:9',
    defaultSubtitles: [
      {
        startTime: 0.5,
        endTime: 5.0,
        text: 'ទីក្រុងអនាគតកំពុងប្រឈមមុខនឹងការផ្លាស់ប្តូរដ៏ធំធេង',
        originalText: 'The futuristic city faces a massive revolution',
        voiceProfile: 'km-KH-PisethNeural',
        gender: 'male',
        speed: 1.0,
      },
      {
        startTime: 5.5,
        endTime: 11.2,
        text: 'ប្រព័ន្ធបញ្ជាសំឡេង JAI DUBBER ត្រូវបានភ្ជាប់ទៅកាន់ម៉ាស៊ីនបកប្រែ',
        originalText: 'JAI DUBBER voice core is connected to the translator unit',
        voiceProfile: 'km-KH-SreymomNeural',
        gender: 'female',
        speed: 1.0,
      }
    ]
  }
];
