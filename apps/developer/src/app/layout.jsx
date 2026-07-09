export const metadata = {
  title: 'Andertal Developer Portal',
  description: 'Build and manage apps for the Andertal platform',
}

export default function RootLayout({ children }) {
  return (
    <html>
      <body style={{ margin: 0, fontFamily: "'Inter', system-ui, sans-serif" }}>
        {children}
      </body>
    </html>
  )
}
