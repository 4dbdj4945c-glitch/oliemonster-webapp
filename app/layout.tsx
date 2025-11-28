import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "It's Done Services",
  description: "Oliemonster analyse portal voor It's Done Services in opdracht van Mourik Infra B.V.",
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
// INSTRUCTIE: Voeg dit toe aan je root component (App.tsx, layout.tsx, of _app.tsx)
// Dit zorgt ervoor dat de webapp storage access vraagt wanneer het in een iframe draait

import { useEffect } from 'react';

export function IframeStorageAccess() {
  useEffect(() => {
    // Check if we're running inside an iframe
    const isInIframe = window.self !== window.top;
    
    if (isInIframe) {
      console.log('🔒 Running in iframe, requesting storage access...');
      
      // Request storage access for cookies and localStorage
      const requestAccess = async () => {
        try {
          // Check if Storage Access API is available
          if (document.requestStorageAccess) {
            await document.requestStorageAccess();
            console.log('✅ Storage access granted!');
            
            // Optional: reload page to ensure all cookies are loaded
            // Uncomment if login still doesn't work after first attempt
            // window.location.reload();
          } else {
            console.warn('⚠️ Storage Access API not available in this browser');
          }
        } catch (error) {
          console.error('❌ Storage access denied:', error);
          
          // Optional: Show user a message to open in new window
          // showFallbackMessage();
        }
      };
      
      // Request access on first user interaction
      document.addEventListener('click', requestAccess, { once: true });
      
      // Cleanup
      return () => {
        document.removeEventListener('click', requestAccess);
      };
    }
  }, []);
  
  return null; // This is a utility component, no UI
}

// GEBRUIK:
// In je App.tsx of layout.tsx, voeg toe:
// 
// function App() {
//   return (
//     <>
//       <IframeStorageAccess />
//       {/* Rest van je app */}
//     </>
//   );
// }

// VOOR NEXT.JS APP ROUTER:
// In app/layout.tsx:
//
// export default function RootLayout({ children }) {
//   return (
//     <html>
//       <body>
//         <IframeStorageAccess />
//         {children}
//       </body>
//     </html>
//   );
// }
