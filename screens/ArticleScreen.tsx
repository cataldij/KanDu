/**
 * ArticleScreen - Full article view for "You KanDu It" tips
 * Generates or sources articles with images using Gemini
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';

type RootStackParamList = {
  Home: undefined;
  Article: {
    title: string;
    category: string;
    icon: string;
    shortDescription: string;
    heroImageUrl?: string; // Optional dynamic hero image from AI
  };
};

type ArticleScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Article'>;
  route: RouteProp<RootStackParamList, 'Article'>;
};

interface Product {
  name: string;
  description: string;
  price: string;
  affiliateLink: string;
  imageUrl: string;
}

interface ArticleContent {
  title: string;
  category: string;
  imageUrl: string;
  timeEstimate: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  sections: {
    heading: string;
    content: string;
  }[];
  products: Product[];
}

export default function ArticleScreen({ navigation, route }: ArticleScreenProps) {
  const { title, category, icon, shortDescription, heroImageUrl } = route.params;
  const [article, setArticle] = useState<ArticleContent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadArticle();
  }, []);

  const loadArticle = async () => {
    try {
      // Generate static article content
      const generatedArticle = generateArticleContent(title, category, shortDescription);

      // Override hero image with dynamic AI-selected image if available
      if (heroImageUrl) {
        generatedArticle.imageUrl = heroImageUrl;
      }

      setArticle(generatedArticle);
    } catch (error) {
      console.error('Error loading article:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateArticleContent = (
    title: string,
    category: string,
    description: string
  ): ArticleContent => {
    // Static DIY guides with affiliate products
    const articles: Record<string, ArticleContent> = {
      'Replace HVAC Filter': {
        title: 'Replace Your HVAC Filter',
        category: 'DIY',
        imageUrl: 'https://images.unsplash.com/photo-1581092580497-e0d23cbdf1dc?w=800',
        timeEstimate: '5 minutes',
        difficulty: 'Easy',
        sections: [
          {
            heading: 'What You\'ll Need',
            content:
              '• New HVAC filter (check size on old filter or furnace door)\n• Optional: Vacuum cleaner for dust',
          },
          {
            heading: 'Step-by-Step Instructions',
            content:
              '1. Turn off your HVAC system at the thermostat\n2. Locate the filter slot (usually near the return air duct or in the furnace)\n3. Check the arrow on the old filter showing airflow direction\n4. Slide out the old filter\n5. Check the size printed on the filter frame (example: 16x25x1)\n6. Insert the new filter with arrow pointing toward the furnace\n7. Turn your system back on',
          },
          {
            heading: 'Pro Tips',
            content:
              '• Write the installation date on the filter frame with a marker\n• Set a phone reminder for 1-3 months from now\n• Keep a spare filter on hand so you never forget\n• Take a photo of the old filter before removing to remember the direction',
          },
          {
            heading: 'Why This Matters',
            content:
              'Replacing your filter regularly saves money on energy bills, improves air quality, and prevents expensive HVAC repairs. A clogged filter makes your system work harder, wasting energy and shortening its lifespan.',
          },
        ],
        products: [
          {
            name: 'Filtrete 16x25x1 Air Filter (6-Pack)',
            description: 'MPR 1000 micro allergen defense. Captures dust, pollen, and pet dander.',
            price: '$54.99',
            affiliateLink: 'https://www.amazon.com/Filtrete-16x25x1-Allergen-Defense-6-Pack/dp/B0BLT88GBQ',
            imageUrl: 'https://m.media-amazon.com/images/I/71fqMIkL5qL._AC_SL1500_.jpg',
          },
          {
            name: 'Honeywell Home Air Filter 4-Pack',
            description: 'FPR 4 filter captures large particles. Budget-friendly and reliable.',
            price: '$22.99',
            affiliateLink: 'https://www.amazon.com/Honeywell-CF100A1009-Replacement-16x25x4-5-Merv/dp/B0090O8MBG',
            imageUrl: 'https://m.media-amazon.com/images/I/61m0kC9vqIL._AC_SL1000_.jpg',
          },
        ],
      },
      'Fix Leaky Faucet': {
        title: 'Fix a Leaky Faucet',
        category: 'DIY',
        imageUrl: 'https://images.unsplash.com/photo-1585704032915-c3400ca199e7?w=800',
        timeEstimate: '15 minutes',
        difficulty: 'Easy',
        sections: [
          {
            heading: 'What You\'ll Need',
            content:
              '• Adjustable wrench or pliers\n• Replacement washers or cartridge kit\n• Screwdriver (flathead and Phillips)\n• Towel or cloth\n• Bucket (optional)',
          },
          {
            heading: 'Step-by-Step Instructions',
            content:
              '1. Turn off water supply under the sink (turn valves clockwise)\n2. Turn on faucet to drain remaining water\n3. Plug the drain to prevent losing small parts\n4. Remove the handle (usually with a small screw)\n5. Unscrew the packing nut with a wrench\n6. Remove the stem and inspect the washer at the bottom\n7. Replace the worn washer with a new one (same size)\n8. Reassemble everything in reverse order\n9. Turn water supply back on and test',
          },
          {
            heading: 'Pro Tips',
            content:
              '• Take photos as you disassemble to remember the order\n• Bring the old washer to the hardware store to match the size\n• If replacing the washer doesn\'t fix it, you may need a new cartridge\n• Apply plumber\'s grease to the washer for a better seal',
          },
          {
            heading: 'Why This Matters',
            content:
              'A leaky faucet wastes up to 3,000 gallons of water per year. That\'s money literally going down the drain! Fixing it yourself saves $100-200 in plumber fees.',
          },
        ],
        products: [
          {
            name: 'Danco 80817 Washer Assortment (42-Pack)',
            description: 'Assorted flat and beveled washers for faucet repairs. Includes common sizes.',
            price: '$5.98',
            affiliateLink: 'https://www.amazon.com/Danco-80817-Flat-Faucet-Washer/dp/B000DZFCS4',
            imageUrl: 'https://m.media-amazon.com/images/I/81uJZ8TxJIL._SL1500_.jpg',
          },
          {
            name: 'CRAFTSMAN Adjustable Wrench Set (2-Piece)',
            description: '6-inch and 10-inch wrenches. Chrome vanadium steel for durability.',
            price: '$24.98',
            affiliateLink: 'https://www.amazon.com/CRAFTSMAN-Adjustable-Wrench-6-Inch-CMMT81629/dp/B08T5QFYRS',
            imageUrl: 'https://m.media-amazon.com/images/I/61lmXr6vXnL._AC_SL1500_.jpg',
          },
        ],
      },
      'Install Smart Outlet': {
        title: 'Install a Smart Outlet',
        category: 'DIY',
        imageUrl: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
        timeEstimate: '10 minutes',
        difficulty: 'Easy',
        sections: [
          {
            heading: 'What You\'ll Need',
            content:
              '• Smart outlet (compatible with Alexa/Google Home)\n• Screwdriver (flathead and Phillips)\n• Wire stripper (if replacing old outlet)\n• Voltage tester\n• Your smartphone',
          },
          {
            heading: 'Step-by-Step Instructions',
            content:
              '1. Turn off power at the breaker box for that outlet\n2. Use voltage tester to confirm power is off\n3. Remove the outlet cover plate\n4. Unscrew the old outlet from the box\n5. Take a photo of wire connections before removing\n6. Disconnect wires from old outlet\n7. Connect wires to smart outlet (black to brass, white to silver, green to ground)\n8. Tuck wires back into box and screw in new outlet\n9. Attach cover plate\n10. Turn power back on and connect to Wi-Fi using the app',
          },
          {
            heading: 'Pro Tips',
            content:
              '• Smart outlets need a neutral wire (white) - some older homes don\'t have one\n• The outlet must fit in the existing box - measure depth before buying\n• Set up schedules in the app to save energy (e.g., turn off coffee maker at 9 AM)\n• Use voice commands: "Alexa, turn on the lamp"',
          },
          {
            heading: 'Why This Matters',
            content:
              'Smart outlets let you control anything from your phone, set schedules to save energy, and monitor power usage. Perfect for lamps, fans, coffee makers, and holiday lights.',
          },
        ],
        products: [
          {
            name: 'Kasa Smart Plug Mini (4-Pack)',
            description: 'Works with Alexa & Google Home. No hub required. Energy monitoring.',
            price: '$29.99',
            affiliateLink: 'https://www.amazon.com/Kasa-Smart-Plug-HS103P4/dp/B07B8W2KHZ',
            imageUrl: 'https://m.media-amazon.com/images/I/51MfJPE3FZL._AC_SL1000_.jpg',
          },
          {
            name: 'Klein Tools NCVT-1 Voltage Tester',
            description: 'Non-contact voltage tester. Automatic on/off. Pocket clip included.',
            price: '$17.97',
            affiliateLink: 'https://www.amazon.com/Klein-Tools-NCVT-1-Non-Contact-Voltage/dp/B00CJKSO3Q',
            imageUrl: 'https://m.media-amazon.com/images/I/61djm4MDEYL._AC_SL1500_.jpg',
          },
        ],
      },
      'Unclog Drain': {
        title: 'Unclog a Drain',
        category: 'DIY',
        imageUrl: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=800',
        timeEstimate: '20 minutes',
        difficulty: 'Easy',
        sections: [
          {
            heading: 'What You\'ll Need',
            content:
              '• Drain snake or zip-it tool\n• Plunger (cup plunger for sinks, flange plunger for toilets)\n• Bucket\n• Rubber gloves\n• Baking soda and vinegar (optional)',
          },
          {
            heading: 'Step-by-Step Instructions',
            content:
              '1. Remove drain cover or stopper\n2. Pull out any visible hair or debris with gloved hand\n3. Try the plunger first - fill sink with 2 inches of water, place plunger over drain, pump vigorously 15-20 times\n4. If still clogged, use a drain snake - feed it down the drain while turning the handle\n5. When you hit the clog, push through it while continuing to turn\n6. Pull snake out slowly, removing debris\n7. Run hot water for a few minutes to flush\n8. For maintenance: pour 1/2 cup baking soda, then 1/2 cup vinegar, wait 30 min, flush with hot water',
          },
          {
            heading: 'Pro Tips',
            content:
              '• Never use chemical drain cleaners - they damage pipes and are toxic\n• For bathroom sinks, the clog is usually hair - a zip-it tool works great\n• For kitchen sinks, it\'s usually grease - boiling water helps\n• Install drain screens to prevent future clogs',
          },
          {
            heading: 'Why This Matters',
            content:
              'Most clogs are simple hair or soap buildup that you can fix in minutes. Calling a plumber costs $150-300. A drain snake costs $10 and lasts forever.',
          },
        ],
        products: [
          {
            name: 'FlexiSnake Drain Millipede Hair Clog Tool',
            description: 'Micro-hooks grab and remove hair. Works on sinks, tubs, and showers.',
            price: '$12.99',
            affiliateLink: 'https://www.amazon.com/FlexiSnake-Drain-Millipede-Clog-Remover/dp/B07VRSM5VG',
            imageUrl: 'https://m.media-amazon.com/images/I/71SbjQBrvsL._AC_SL1500_.jpg',
          },
          {
            name: 'Vastar 3-Pack 25 Inch Drain Snake',
            description: 'Flexible plastic drain cleaners. Disposable and easy to use.',
            price: '$6.99',
            affiliateLink: 'https://www.amazon.com/Vastar-Drain-Snake-Remover-Cleaning/dp/B01DP87IF8',
            imageUrl: 'https://m.media-amazon.com/images/I/71y2UY5cODL._AC_SL1500_.jpg',
          },
        ],
      },
      'Caulk Bathtub': {
        title: 'Caulk Your Bathtub',
        category: 'DIY',
        imageUrl: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=800',
        timeEstimate: '30 minutes',
        difficulty: 'Easy',
        sections: [
          {
            heading: 'What You\'ll Need',
            content:
              '• Silicone caulk (mold/mildew resistant)\n• Caulk gun\n• Utility knife or caulk removal tool\n• Rubbing alcohol\n• Painter\'s tape\n• Paper towels',
          },
          {
            heading: 'Step-by-Step Instructions',
            content:
              '1. Remove old caulk completely with utility knife\n2. Clean the area with rubbing alcohol and let dry\n3. Apply painter\'s tape along both edges where you\'ll caulk\n4. Cut caulk tube tip at 45-degree angle (start small, you can always cut more)\n5. Load caulk into gun and squeeze trigger to start flow\n6. Apply steady bead along the joint in one continuous motion\n7. Wet your finger and smooth the bead in one motion\n8. Remove painter\'s tape immediately\n9. Let cure 24 hours before using shower',
          },
          {
            heading: 'Pro Tips',
            content:
              '• Use 100% silicone caulk, not latex - it lasts longer and is more water-resistant\n• Fill the tub with water before caulking - this prevents the caulk from pulling away when the tub is full\n• The key to a good bead is steady pressure and speed\n• Don\'t let old caulk sit - mold can grow underneath and spread',
          },
          {
            heading: 'Why This Matters',
            content:
              'Old or missing caulk allows water to seep behind the tub, causing mold, rot, and expensive structural damage. Fresh caulk prevents leaks and looks clean.',
          },
        ],
        products: [
          {
            name: 'GE Silicone II Kitchen & Bath Caulk (Clear)',
            description: '100% silicone. Mold & mildew resistant. 7-year protection.',
            price: '$7.98',
            affiliateLink: 'https://www.amazon.com/GE-GE5070-Silicone-Kitchen-10-1-Ounce/dp/B000DZFGQ0',
            imageUrl: 'https://m.media-amazon.com/images/I/71FeEYx2VUL._AC_SL1500_.jpg',
          },
          {
            name: 'Newborn 930-GTD Drip-Free Caulk Gun',
            description: 'Smooth rod caulking gun. Drip-free design. Professional quality.',
            price: '$11.48',
            affiliateLink: 'https://www.amazon.com/Newborn-930-GTD-Drip-Free-Smooth-Caulking/dp/B000BQOX8E',
            imageUrl: 'https://m.media-amazon.com/images/I/71vP3dqOH7L._AC_SL1500_.jpg',
          },
        ],
      },
      'Replace Doorknob': {
        title: 'Replace a Doorknob',
        category: 'DIY',
        imageUrl: 'https://images.unsplash.com/photo-1558346648-9757f2fa4474?w=800',
        timeEstimate: '15 minutes',
        difficulty: 'Easy',
        sections: [
          {
            heading: 'What You\'ll Need',
            content:
              '• New doorknob set (measure your door thickness first - usually 1-3/8" or 1-3/4")\n• Screwdriver (Phillips or flathead depending on existing knob)\n• Tape measure',
          },
          {
            heading: 'Step-by-Step Instructions',
            content:
              '1. Open the door and locate the screws on the interior side of the knob\n2. Remove the screws and pull both knobs away from the door\n3. Remove the latch plate screws on the door edge\n4. Pull out the latch mechanism\n5. Insert the new latch mechanism (make sure the beveled side faces the strike plate)\n6. Screw in the latch plate\n7. Insert the exterior knob spindle through the latch\n8. Attach the interior knob and secure with screws\n9. Test the knob to ensure smooth operation',
          },
          {
            heading: 'Pro Tips',
            content:
              '• Most modern doorknobs are universal and fit standard holes\n• Keep the old screws in case the new ones are too long\n• If the door doesn\'t latch, adjust the strike plate on the door frame\n• Consider upgrading to a keyed lock for exterior doors',
          },
          {
            heading: 'Why This Matters',
            content:
              'Worn doorknobs can fail to latch properly, leaving your door ajar. New knobs improve security, function, and appearance. Installation takes 15 minutes and costs way less than a locksmith.',
          },
        ],
        products: [
          {
            name: 'Kwikset Tylo Entry Door Knob (Satin Nickel)',
            description: 'Entry door knob with keyed lock. Adjustable latch fits all standard doors.',
            price: '$24.18',
            affiliateLink: 'https://www.amazon.com/Kwikset-94002-866-Entry-Satin-Nickel/dp/B0002YP1Q6',
            imageUrl: 'https://m.media-amazon.com/images/I/71SsDUVtraL._AC_SL1500_.jpg',
          },
          {
            name: 'Amazon Basics Bedroom/Bathroom Door Knob',
            description: 'Privacy knob with push-button lock. Easy installation.',
            price: '$11.38',
            affiliateLink: 'https://www.amazon.com/Amazon-Basics-Bedroom-Bathroom-Privacy/dp/B08KQ39W7P',
            imageUrl: 'https://m.media-amazon.com/images/I/61YYj2jMkjL._AC_SL1500_.jpg',
          },
        ],
      },
      'Patch Drywall': {
        title: 'Patch a Drywall Hole',
        category: 'DIY',
        imageUrl: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800',
        timeEstimate: '45 minutes (plus drying time)',
        difficulty: 'Medium',
        sections: [
          {
            heading: 'What You\'ll Need',
            content:
              '• Drywall patch kit (for holes under 4 inches) OR drywall piece and mesh tape (for larger holes)\n• Joint compound (spackling)\n• Putty knife (4-inch and 6-inch)\n• Sandpaper (120-grit)\n• Paint to match wall',
          },
          {
            heading: 'Step-by-Step Instructions',
            content:
              'For small holes (less than 1 inch):\n1. Clean loose debris from the hole\n2. Apply spackling compound with putty knife\n3. Smooth flush with wall\n4. Let dry 2-4 hours, sand smooth, repeat if needed\n\nFor medium holes (1-4 inches):\n1. Use a self-adhesive mesh patch\n2. Stick patch over hole\n3. Apply thin coat of joint compound over patch\n4. Let dry overnight, sand smooth\n5. Apply second thin coat, feathering edges\n6. Sand, prime, and paint\n\nFor large holes (4+ inches):\n1. Cut hole into square shape\n2. Cut drywall piece slightly larger than hole\n3. Attach with drywall screws to studs\n4. Apply mesh tape over seams\n5. Apply 3 coats of joint compound, sanding between each\n6. Prime and paint',
          },
          {
            heading: 'Pro Tips',
            content:
              '• Thin coats dry faster and look better than thick coats\n• Feather the edges by applying less pressure as you move away from the patch\n• Use a damp sponge instead of sandpaper to avoid dust\n• Prime before painting or the patch will show through',
          },
          {
            heading: 'Why This Matters',
            content:
              'Drywall holes from removed fixtures, doorknob damage, or accidents are easy to fix yourself. Hiring someone costs $100-300. A patch kit costs $5.',
          },
        ],
        products: [
          {
            name: '3M High Strength Large Hole Repair Kit',
            description: 'Complete kit for holes up to 5 inches. Includes patch, spackling, and tools.',
            price: '$12.47',
            affiliateLink: 'https://www.amazon.com/3M-High-Strength-Repair-contains/dp/B000VXIPEY',
            imageUrl: 'https://m.media-amazon.com/images/I/71CgNmPfZoL._AC_SL1500_.jpg',
          },
          {
            name: 'DAP DryDex Dry Time Indicator Spackling',
            description: 'Goes on pink, dries white. Easy to see when ready to sand.',
            price: '$5.98',
            affiliateLink: 'https://www.amazon.com/DAP-12348-Drydex-Spackling-Interior/dp/B000LNSWLA',
            imageUrl: 'https://m.media-amazon.com/images/I/71MuMdVgMnL._AC_SL1500_.jpg',
          },
        ],
      },
      'Install Shelf': {
        title: 'Install a Shelf',
        category: 'DIY',
        imageUrl: 'https://images.unsplash.com/photo-1595428774223-ef52624120d2?w=800',
        timeEstimate: '30 minutes',
        difficulty: 'Easy',
        sections: [
          {
            heading: 'What You\'ll Need',
            content:
              '• Floating shelf or shelf with brackets\n• Stud finder\n• Level\n• Drill with bits\n• Screws and wall anchors (if not hitting studs)\n• Pencil',
          },
          {
            heading: 'Step-by-Step Instructions',
            content:
              '1. Use stud finder to locate studs - mark with pencil\n2. Decide shelf height and mark with pencil\n3. Hold shelf against wall and use level to ensure it\'s straight\n4. Mark screw holes through shelf brackets\n5. If hitting studs: drill pilot holes and screw directly into studs\n6. If between studs: drill holes, insert wall anchors, then screw into anchors\n7. Attach shelf to brackets (if separate)\n8. Use level one more time to verify\n9. Test with weight before loading',
          },
          {
            heading: 'Pro Tips',
            content:
              '• Always try to hit at least one stud - shelves are strongest when anchored to studs\n• For heavy loads (books, etc.), hit two studs or use toggle bolts\n• Measure twice, drill once - holes in the wall are permanent\n• Use a laser level if installing multiple shelves to ensure they\'re aligned',
          },
          {
            heading: 'Why This Matters',
            content:
              'Shelves add storage and style to any room. Installing your own saves $50-150 per shelf in installation fees.',
          },
        ],
        products: [
          {
            name: 'Greenco Floating Shelves (Set of 3)',
            description: 'Wall mounted shelves. Easy install with included hardware. White finish.',
            price: '$18.89',
            affiliateLink: 'https://www.amazon.com/Greenco-Set-Floating-Shelves-White/dp/B0177HI11W',
            imageUrl: 'https://m.media-amazon.com/images/I/61IuQBnKHaL._AC_SL1500_.jpg',
          },
          {
            name: 'Zircon StudSensor e50 Electronic Stud Finder',
            description: 'Finds studs up to 1.5" deep. SpotLite pointer. Easy to use.',
            price: '$24.97',
            affiliateLink: 'https://www.amazon.com/Zircon-StudSensor-Electronic-Finder-Patented/dp/B002R5AVVY',
            imageUrl: 'https://m.media-amazon.com/images/I/71ooVAL9EQL._AC_SL1500_.jpg',
          },
        ],
      },
      'Replace Showerhead': {
        title: 'Replace Your Showerhead',
        category: 'DIY',
        imageUrl: 'https://images.unsplash.com/photo-1585704032915-c3400ca199e7?w=800',
        timeEstimate: '10 minutes',
        difficulty: 'Easy',
        sections: [
          {
            heading: 'What You\'ll Need',
            content:
              '• New showerhead\n• Adjustable wrench or pliers\n• Plumber\'s tape (Teflon tape)\n• Towel or cloth',
          },
          {
            heading: 'Step-by-Step Instructions',
            content:
              '1. No need to turn off water - just don\'t turn it on\n2. Wrap a cloth around the showerhead arm to protect the finish\n3. Use wrench to turn the old showerhead counterclockwise\n4. Clean the threads on the shower arm\n5. Wrap 3-4 layers of plumber\'s tape clockwise around the threads\n6. Hand-tighten the new showerhead clockwise\n7. Use wrench to snug it (don\'t overtighten)\n8. Turn on water and check for leaks\n9. If it leaks, add more plumber\'s tape',
          },
          {
            heading: 'Pro Tips',
            content:
              '• Wrap the tape clockwise (in the direction you\'ll screw the head on)\n• Start the tape a few threads back from the end\n• Don\'t overtighten - hand-tight plus a quarter turn is enough\n• Low-flow showerheads save water and lower bills without sacrificing pressure',
          },
          {
            heading: 'Why This Matters',
            content:
              'A new showerhead can transform your shower experience. High-efficiency models save 2,700 gallons of water per year while providing better pressure.',
          },
        ],
        products: [
          {
            name: 'Moen Magnetix 6-Function Handheld Showerhead',
            description: 'Magnetic docking. 6 spray modes. Chrome finish. Easy to install.',
            price: '$47.65',
            affiliateLink: 'https://www.amazon.com/Moen-26100-Magnetix-Handheld-Showerhead/dp/B01LYQCFNK',
            imageUrl: 'https://m.media-amazon.com/images/I/71Ws9LQMTDL._AC_SL1500_.jpg',
          },
          {
            name: 'Harvey 017117 PTFE Thread Seal Tape (10-Pack)',
            description: 'Professional plumbers tape. Prevents leaks. 1/2" x 260".',
            price: '$8.99',
            affiliateLink: 'https://www.amazon.com/Harvey-017117-Thread-Seal-Tape/dp/B000DZGN18',
            imageUrl: 'https://m.media-amazon.com/images/I/71QKb0xFI3L._AC_SL1500_.jpg',
          },
        ],
      },
      'Clean Garbage Disposal': {
        title: 'Clean Your Garbage Disposal',
        category: 'DIY',
        imageUrl: 'https://images.unsplash.com/photo-1585704032915-c3400ca199e7?w=800',
        timeEstimate: '5 minutes',
        difficulty: 'Easy',
        sections: [
          {
            heading: 'What You\'ll Need',
            content:
              '• Ice cubes\n• Rock salt or dish soap\n• Baking soda and vinegar\n• Lemon or orange peels',
          },
          {
            heading: 'Step-by-Step Instructions',
            content:
              '1. Turn off the disposal and run cold water\n2. Drop 2 cups of ice cubes into the disposal\n3. Add 1 cup of rock salt (or dish soap)\n4. Turn on disposal and run for 30 seconds while cold water runs\n5. Turn off disposal and pour 1/2 cup baking soda down the drain\n6. Pour 1 cup of vinegar - let fizz for 10 minutes\n7. Flush with hot water for 1 minute\n8. Grind lemon or orange peels for fresh scent',
          },
          {
            heading: 'Pro Tips',
            content:
              '• Ice and salt scrub away buildup on the blades and walls\n• Never put grease, fibrous vegetables (celery), or coffee grounds down the disposal\n• Run cold water before, during, and after using disposal\n• Clean weekly to prevent odors and buildup',
          },
          {
            heading: 'Why This Matters',
            content:
              'A clean disposal prevents clogs, eliminates odors, and extends the life of your unit. This simple maintenance takes 5 minutes and costs pennies.',
          },
        ],
        products: [
          {
            name: 'Plink Garbage Disposal Freshener (40-Pack)',
            description: 'Effervescent cleaning action. Fresh lemon scent. Biodegradable.',
            price: '$7.97',
            affiliateLink: 'https://www.amazon.com/Plink-Garbage-Disposal-Cleaner-Freshener/dp/B000PI02M8',
            imageUrl: 'https://m.media-amazon.com/images/I/71sjOLb6v3L._AC_SL1500_.jpg',
          },
          {
            name: 'Glisten Disposer Care Freshener (12-Pack)',
            description: 'Foaming cleaner. Eliminates odors. Use monthly for best results.',
            price: '$8.99',
            affiliateLink: 'https://www.amazon.com/Glisten-DP06N-PB-Disposer-Freshener-4-9-Ounce/dp/B001D97CJI',
            imageUrl: 'https://m.media-amazon.com/images/I/71yq9CUc2PL._AC_SL1500_.jpg',
          },
        ],
      },
      'Check Your HVAC Filter': {
        title: 'Check Your HVAC Filter',
        category: 'HVAC',
        imageUrl: 'https://images.unsplash.com/photo-1581092580497-e0d23cbdf1dc?w=800',
        timeEstimate: '5 minutes',
        difficulty: 'Easy',
        products: [],
        sections: [
          {
            heading: 'Why It Matters',
            content:
              "Your HVAC filter is the first line of defense against dust, allergens, and pollutants circulating in your home. A clean filter improves air quality, reduces energy costs, and extends the life of your HVAC system. When filters get clogged, your system has to work harder, which can lead to higher energy bills and potential system failure.",
          },
          {
            heading: 'When to Replace',
            content:
              "Standard 1-inch filters should be replaced every 1-3 months. If you have pets, allergies, or live in a dusty area, check monthly. Thicker 4-inch filters can last 6-12 months. Set a calendar reminder so you don't forget!",
          },
          {
            heading: 'How to Replace',
            content:
              "1. Turn off your HVAC system\n2. Locate the filter (usually near the return air duct or furnace)\n3. Note the arrow showing airflow direction on the old filter\n4. Remove the old filter and dispose of it\n5. Insert the new filter with the arrow pointing toward the furnace\n6. Turn your system back on",
          },
          {
            heading: 'Choosing the Right Filter',
            content:
              'Filters are rated by MERV (Minimum Efficiency Reporting Value). MERV 8-11 is ideal for most homes. Higher ratings (MERV 13+) trap more particles but may restrict airflow in older systems. Check your system manual for recommendations.',
          },
        ],
      },
      'Frozen Pipes': {
        title: 'Prevent Frozen Pipes',
        category: 'Plumbing',
        imageUrl: 'https://images.unsplash.com/photo-1504192010706-dd7f569ee2be?w=800',
        sections: [
          {
            heading: 'Why Pipes Freeze',
            content:
              'When water freezes, it expands by about 9%. This expansion creates tremendous pressure inside pipes, which can cause them to burst. Even a small crack can spray hundreds of gallons of water per day, causing thousands of dollars in damage.',
          },
          {
            heading: 'Prevention Tips',
            content:
              "1. Let faucets drip slightly during freezing weather\n2. Open cabinet doors under sinks to let warm air circulate\n3. Keep your thermostat at the same temperature day and night\n4. Insulate pipes in unheated areas (basement, attic, garage)\n5. Seal cracks and openings around pipes with caulk",
          },
          {
            heading: 'If Pipes Freeze',
            content:
              "If you turn on a faucet and only a trickle comes out, suspect a frozen pipe. Keep the faucet open and apply heat with a hair dryer, heating pad, or towels soaked in hot water. Never use a blowtorch or open flame! Start from the faucet and work toward the frozen area.",
          },
          {
            heading: 'When to Call a Pro',
            content:
              "Call a plumber immediately if you can't locate the frozen area, the pipe is inaccessible, or you suspect the pipe has already burst. Turn off the main water supply if you see any leaks.",
          },
        ],
      },
      'Prevent Frozen Pipes': {
        title: 'Prevent Frozen Pipes',
        category: 'Plumbing',
        imageUrl: 'https://images.unsplash.com/photo-1504192010706-dd7f569ee2be?w=800',
        sections: [
          {
            heading: 'Why Pipes Freeze',
            content:
              'When water freezes, it expands by about 9%. This expansion creates tremendous pressure inside pipes, which can cause them to burst. Even a small crack can spray hundreds of gallons of water per day, causing thousands of dollars in damage.',
          },
          {
            heading: 'Prevention Tips',
            content:
              "1. Let faucets drip slightly during freezing weather\n2. Open cabinet doors under sinks to let warm air circulate\n3. Keep your thermostat at the same temperature day and night\n4. Insulate pipes in unheated areas (basement, attic, garage)\n5. Seal cracks and openings around pipes with caulk",
          },
          {
            heading: 'If Pipes Freeze',
            content:
              "If you turn on a faucet and only a trickle comes out, suspect a frozen pipe. Keep the faucet open and apply heat with a hair dryer, heating pad, or towels soaked in hot water. Never use a blowtorch or open flame! Start from the faucet and work toward the frozen area.",
          },
          {
            heading: 'When to Call a Pro',
            content:
              "Call a plumber immediately if you can't locate the frozen area, the pipe is inaccessible, or you suspect the pipe has already burst. Turn off the main water supply if you see any leaks.",
          },
        ],
      },
      'GFCI Outlets': {
        title: 'Test Your GFCI Outlets',
        category: 'Electrical',
        imageUrl: 'https://images.unsplash.com/photo-1621905251918-48416bd8575a?w=800',
        sections: [
          {
            heading: 'What is a GFCI?',
            content:
              'Ground Fault Circuit Interrupter (GFCI) outlets protect you from electrical shock by detecting imbalances in electrical current and shutting off power in milliseconds. They\'re required in wet areas like bathrooms, kitchens, garages, and outdoor locations.',
          },
          {
            heading: 'Why Test Monthly',
            content:
              "GFCIs can fail over time, leaving you unprotected. Monthly testing ensures they're working properly. The test takes only 30 seconds and could save your life.",
          },
          {
            heading: 'How to Test',
            content:
              "1. Plug a lamp or radio into the GFCI outlet and turn it on\n2. Press the TEST button on the outlet\n3. The device should turn off immediately\n4. Press the RESET button\n5. The device should turn back on\n\nIf the device doesn't turn off when you press TEST, the GFCI is faulty and needs replacement.",
          },
          {
            heading: 'Replacement',
            content:
              "If your GFCI fails the test, turn off power at the breaker and replace it. GFCI outlets cost $10-20 and are straightforward to install if you're comfortable with basic electrical work. Otherwise, call an electrician.",
          },
        ],
      },
      'Test Your GFCI Outlets': {
        title: 'Test Your GFCI Outlets',
        category: 'Electrical',
        imageUrl: 'https://images.unsplash.com/photo-1621905251918-48416bd8575a?w=800',
        sections: [
          {
            heading: 'What is a GFCI?',
            content:
              'Ground Fault Circuit Interrupter (GFCI) outlets protect you from electrical shock by detecting imbalances in electrical current and shutting off power in milliseconds. They\'re required in wet areas like bathrooms, kitchens, garages, and outdoor locations.',
          },
          {
            heading: 'Why Test Monthly',
            content:
              "GFCIs can fail over time, leaving you unprotected. Monthly testing ensures they're working properly. The test takes only 30 seconds and could save your life.",
          },
          {
            heading: 'How to Test',
            content:
              "1. Plug a lamp or radio into the GFCI outlet and turn it on\n2. Press the TEST button on the outlet\n3. The device should turn off immediately\n4. Press the RESET button\n5. The device should turn back on\n\nIf the device doesn't turn off when you press TEST, the GFCI is faulty and needs replacement.",
          },
          {
            heading: 'Replacement',
            content:
              "If your GFCI fails the test, turn off power at the breaker and replace it. GFCI outlets cost $10-20 and are straightforward to install if you're comfortable with basic electrical work. Otherwise, call an electrician.",
          },
        ],
      },
      'Dryer Vent': {
        title: 'Clean Your Dryer Vent',
        category: 'Appliances',
        imageUrl: 'https://images.unsplash.com/photo-1582735689369-4fe89db7114c?w=800',
        sections: [
          {
            heading: 'Fire Hazard',
            content:
              'Dryer fires cause an estimated $35 million in property damage annually in the U.S. Lint is highly flammable, and when it builds up in your dryer vent, it restricts airflow and creates dangerous heat buildup. Cleaning your vent every 6 months dramatically reduces this risk.',
          },
          {
            heading: 'Signs You Need Cleaning',
            content:
              "• Clothes take longer than one cycle to dry\n• Clothes are very hot at the end of the cycle\n• The outside of the dryer gets very hot\n• You smell a burning odor\n• The laundry room feels more humid than usual\n• Lint builds up around the dryer door",
          },
          {
            heading: 'How to Clean',
            content:
              "1. Unplug the dryer and pull it away from the wall\n2. Disconnect the vent hose from the dryer\n3. Use a vacuum with a long hose attachment to clean inside the vent\n4. Use a dryer vent brush (available at hardware stores) to scrub the vent duct\n5. Clean lint from the outdoor vent opening\n6. Reconnect everything and test",
          },
          {
            heading: 'Professional Service',
            content:
              "For long vent runs (over 25 feet) or complex routing, consider hiring a professional dryer vent cleaning service every 1-2 years. They have specialized tools to thoroughly clean the entire duct system.",
          },
        ],
      },
      'Clean Your Dryer Vent': {
        title: 'Clean Your Dryer Vent',
        category: 'Appliances',
        imageUrl: 'https://images.unsplash.com/photo-1582735689369-4fe89db7114c?w=800',
        sections: [
          {
            heading: 'Fire Hazard',
            content:
              'Dryer fires cause an estimated $35 million in property damage annually in the U.S. Lint is highly flammable, and when it builds up in your dryer vent, it restricts airflow and creates dangerous heat buildup. Cleaning your vent every 6 months dramatically reduces this risk.',
          },
          {
            heading: 'Signs You Need Cleaning',
            content:
              "• Clothes take longer than one cycle to dry\n• Clothes are very hot at the end of the cycle\n• The outside of the dryer gets very hot\n• You smell a burning odor\n• The laundry room feels more humid than usual\n• Lint builds up around the dryer door",
          },
          {
            heading: 'How to Clean',
            content:
              "1. Unplug the dryer and pull it away from the wall\n2. Disconnect the vent hose from the dryer\n3. Use a vacuum with a long hose attachment to clean inside the vent\n4. Use a dryer vent brush (available at hardware stores) to scrub the vent duct\n5. Clean lint from the outdoor vent opening\n6. Reconnect everything and test",
          },
          {
            heading: 'Professional Service',
            content:
              "For long vent runs (over 25 feet) or complex routing, consider hiring a professional dryer vent cleaning service every 1-2 years. They have specialized tools to thoroughly clean the entire duct system.",
          },
        ],
      },
      'Tire Pressure': {
        title: 'Check Your Tire Pressure',
        category: 'Automotive',
        imageUrl: 'https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?w=800',
        sections: [
          {
            heading: 'Why It Matters',
            content:
              'Proper tire pressure improves fuel efficiency by up to 3%, extends tire life, improves handling, and keeps you safe. Under-inflated tires generate excessive heat and are prone to blowouts. Over-inflated tires reduce traction and wear unevenly.',
          },
          {
            heading: 'When to Check',
            content:
              "Check tire pressure monthly and before long trips. Check when tires are cold (before driving or at least 3 hours after driving). Temperature affects pressure - tires lose about 1 PSI for every 10°F drop in temperature.",
          },
          {
            heading: 'How to Check',
            content:
              "1. Find the recommended PSI on the sticker inside your driver's door jamb\n2. Remove the valve cap from the tire\n3. Press a tire pressure gauge firmly onto the valve stem\n4. Read the pressure\n5. Add or release air as needed\n6. Replace the valve cap\n\nDigital gauges ($10-30) are more accurate than stick gauges and easier to read.",
          },
          {
            heading: 'TPMS Systems',
            content:
              "Most cars built after 2007 have Tire Pressure Monitoring Systems (TPMS) that warn when pressure is low. However, the light only comes on when pressure drops 25% below recommended levels - by then, you've already lost fuel efficiency and tire life. Manual checks are still important.",
          },
        ],
      },
      'Check Your Tire Pressure': {
        title: 'Check Your Tire Pressure',
        category: 'Automotive',
        imageUrl: 'https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?w=800',
        sections: [
          {
            heading: 'Why It Matters',
            content:
              'Proper tire pressure improves fuel efficiency by up to 3%, extends tire life, improves handling, and keeps you safe. Under-inflated tires generate excessive heat and are prone to blowouts. Over-inflated tires reduce traction and wear unevenly.',
          },
          {
            heading: 'When to Check',
            content:
              "Check tire pressure monthly and before long trips. Check when tires are cold (before driving or at least 3 hours after driving). Temperature affects pressure - tires lose about 1 PSI for every 10°F drop in temperature.",
          },
          {
            heading: 'How to Check',
            content:
              "1. Find the recommended PSI on the sticker inside your driver's door jamb\n2. Remove the valve cap from the tire\n3. Press a tire pressure gauge firmly onto the valve stem\n4. Read the pressure\n5. Add or release air as needed\n6. Replace the valve cap\n\nDigital gauges ($10-30) are more accurate than stick gauges and easier to read.",
          },
          {
            heading: 'TPMS Systems',
            content:
              "Most cars built after 2007 have Tire Pressure Monitoring Systems (TPMS) that warn when pressure is low. However, the light only comes on when pressure drops 25% below recommended levels - by then, you've already lost fuel efficiency and tire life. Manual checks are still important.",
          },
        ],
      },
    };

    return (
      articles[title] || {
        title,
        category,
        imageUrl: 'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=800',
        timeEstimate: '15 minutes',
        difficulty: 'Easy' as const,
        sections: [
          {
            heading: 'About This Task',
            content: description,
          },
        ],
        products: [],
      }
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1E90FF" />
        <Text style={styles.loadingText}>Loading article...</Text>
      </View>
    );
  }

  if (!article) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Article not found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Hero Image */}
      <View style={styles.heroContainer}>
        <Image source={{ uri: article.imageUrl }} style={styles.heroImage} />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.7)']}
          style={styles.heroGradient}
        >
          <View style={styles.heroContent}>
            <Text style={styles.heroCategory}>{article.category}</Text>
            <Text style={styles.heroTitle}>{article.title}</Text>
          </View>
        </LinearGradient>
      </View>

      {/* Article Content */}
      <View style={styles.content}>
        {/* Time and Difficulty Badges */}
        <View style={styles.badges}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>⏱️ {article.timeEstimate}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: article.difficulty === 'Easy' ? '#10b981' : article.difficulty === 'Medium' ? '#f59e0b' : '#ef4444' }]}>
            <Text style={styles.badgeText}>{article.difficulty}</Text>
          </View>
        </View>

        {article.sections.map((section, index) => (
          <View key={index} style={styles.section}>
            <Text style={styles.sectionHeading}>{section.heading}</Text>
            <Text style={styles.sectionContent}>{section.content}</Text>
          </View>
        ))}

        {/* Products Section */}
        {article.products && article.products.length > 0 && (
          <View style={styles.productsSection}>
            <Text style={styles.productsHeading}>Recommended Products</Text>
            {article.products.map((product, index) => (
              <TouchableOpacity
                key={index}
                style={styles.productCard}
                onPress={() => WebBrowser.openBrowserAsync(product.affiliateLink)}
                activeOpacity={0.7}
              >
                <Image source={{ uri: product.imageUrl }} style={styles.productImage} />
                <View style={styles.productInfo}>
                  <Text style={styles.productName}>{product.name}</Text>
                  <Text style={styles.productDescription}>{product.description}</Text>
                  <Text style={styles.productPrice}>{product.price}</Text>
                  <View style={styles.buyButton}>
                    <Text style={styles.buyButtonText}>View on Amazon</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Call to Action */}
        <View style={styles.cta}>
          <Text style={styles.ctaText}>
            Need help? Use "Diagnose it" for personalized step-by-step guidance!
          </Text>
        </View>
      </View>

      {/* Bottom spacing */}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E8F4F8',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#64748b',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E8F4F8',
  },
  errorText: {
    fontSize: 16,
    color: '#ef4444',
  },
  heroContainer: {
    position: 'relative',
    height: 300,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 200,
    justifyContent: 'flex-end',
  },
  heroContent: {
    padding: 24,
  },
  heroCategory: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.9)',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#ffffff',
    lineHeight: 38,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  content: {
    padding: 20,
  },
  section: {
    marginBottom: 28,
  },
  sectionHeading: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1E5AA8',
    marginBottom: 12,
  },
  sectionContent: {
    fontSize: 16,
    color: '#1e293b',
    lineHeight: 26,
  },
  cta: {
    backgroundColor: '#f0f9ff',
    padding: 20,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#1E90FF',
    marginTop: 12,
  },
  ctaText: {
    fontSize: 15,
    color: '#1e293b',
    lineHeight: 22,
    fontWeight: '500',
  },
  badges: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  badge: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  productsSection: {
    marginTop: 32,
    marginBottom: 20,
  },
  productsHeading: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1E5AA8',
    marginBottom: 16,
  },
  productCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginBottom: 16,
    flexDirection: 'row',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  productImage: {
    width: 120,
    height: 120,
    resizeMode: 'contain',
    backgroundColor: '#f8fafc',
  },
  productInfo: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
  },
  productName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  productDescription: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
    marginBottom: 8,
  },
  productPrice: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E5AA8',
    marginBottom: 8,
  },
  buyButton: {
    backgroundColor: '#FF9900',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  buyButtonText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '700',
  },
});
