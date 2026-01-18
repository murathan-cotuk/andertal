# Auth System Usage Guide

Bu dokümantasyon, Belucha Auth System'in nasıl kullanılacağını açıklar.

## 📚 İçindekiler

1. [Protected Routes (Client-Side)](#1-protected-routes-client-side)
2. [Server-Side Protection](#2-server-side-protection)
3. [Role Checks](#3-role-checks)
4. [Login Pages](#4-login-pages)
5. [AuthContext Kullanımı](#5-authcontext-kullanımı)

---

## 1. Protected Routes (Client-Side)

Route'ları korumak için 3 farklı pattern kullanabilirsiniz:

### Option A: Hook Pattern

```jsx
import { useAuthGuard } from '@belucha/lib';

function AccountPage() {
  useAuthGuard({ requiredRole: 'customer', redirectTo: '/login' });
  
  return <div>Account content</div>;
}
```

**Avantajlar:**
- En esnek pattern
- Component içinde kontrol sağlar
- Conditional logic eklenebilir

### Option B: HOC Pattern

```jsx
import { withAuthGuard } from '@belucha/lib';

const AccountPage = withAuthGuard(
  function Account() {
    return <div>Account content</div>;
  },
  { requiredRole: 'customer', redirectTo: '/login' }
);
```

**Avantajlar:**
- Component'i wrap eder
- Reusable pattern
- Class component'lerle uyumlu

### Option C: Component Pattern

```jsx
import { ProtectedRoute } from '@belucha/lib';

function AccountPage() {
  return (
    <ProtectedRoute requiredRole="customer" redirectTo="/login">
      <div>Account content</div>
    </ProtectedRoute>
  );
}
```

**Avantajlar:**
- JSX syntax
- Children pattern
- En okunabilir

---

## 2. Server-Side Protection

Next.js `getServerSideProps` içinde kullanın:

```jsx
import { serverSideAuthGuard } from '@belucha/lib';

export async function getServerSideProps(context) {
  const guardResult = serverSideAuthGuard(context, {
    requiredRole: 'customer',
    redirectTo: '/login'
  });
  
  if (guardResult) return guardResult;
  
  // User is authenticated, fetch data
  return { 
    props: {
      // Your props
    }
  };
}
```

**Özellikler:**
- Server-side'da çalışır (SEO-friendly)
- Cookie'lerden token okur
- Redirect'i server-side yapar (daha hızlı)

---

## 3. Role Checks

### hasRole()

Belirli bir role sahip olup olmadığını kontrol eder:

```jsx
import { hasRole } from '@belucha/lib';

function SellerDashboard() {
  if (hasRole('seller')) {
    return <div>Seller-only content</div>;
  }
  
  return <div>Access denied</div>;
}
```

### getCurrentRole()

Mevcut kullanıcının role'ünü döner:

```jsx
import { getCurrentRole } from '@belucha/lib';

function UserProfile() {
  const role = getCurrentRole();
  
  if (role === 'customer') {
    return <CustomerProfile />;
  } else if (role === 'seller') {
    return <SellerProfile />;
  }
  
  return <div>Please login</div>;
}
```

### isAnyUserAuthenticated()

Herhangi bir kullanıcı giriş yapmış mı kontrol eder:

```jsx
import { isAnyUserAuthenticated } from '@belucha/lib';

function Header() {
  const isLoggedIn = isAnyUserAuthenticated();
  
  return (
    <header>
      {isLoggedIn ? (
        <LogoutButton />
      ) : (
        <LoginButton />
      )}
    </header>
  );
}
```

---

## 4. Login Pages

Login sayfalarında, zaten giriş yapmış kullanıcıları ana sayfaya yönlendirin:

```jsx
import { useAuthGuard } from '@belucha/lib';

function LoginPage() {
  useAuthGuard({
    requiredRole: 'customer',
    redirectTo: '/',
    redirectIfAuthenticated: true // ← Zaten giriş yapmışsa ana sayfaya yönlendir
  });
  
  return <LoginForm />;
}
```

**redirectIfAuthenticated: true** kullanıldığında:
- Kullanıcı zaten giriş yapmışsa → Ana sayfaya yönlendirilir
- Kullanıcı giriş yapmamışsa → Login formu gösterilir

---

## 5. AuthContext Kullanımı

### Customer Auth

```jsx
import { CustomerAuthProvider, useCustomerAuth } from '@belucha/lib';

function App() {
  return (
    <CustomerAuthProvider>
      <YourApp />
    </CustomerAuthProvider>
  );
}

function AccountPage() {
  const { isAuthenticated, isLoading, token, userId, user, login, logout } = useCustomerAuth();
  
  if (isLoading) return <div>Loading...</div>;
  
  if (!isAuthenticated) return <div>Please login</div>;
  
  return (
    <div>
      <p>Welcome, {user?.email}</p>
      <button onClick={logout}>Logout</button>
    </div>
  );
}
```

### Seller Auth

```jsx
import { SellerAuthProvider, useSellerAuth } from '@belucha/lib';

function SellerApp() {
  return (
    <SellerAuthProvider>
      <YourSellerApp />
    </SellerAuthProvider>
  );
}

function SellerDashboard() {
  const { isAuthenticated, login, logout } = useSellerAuth();
  
  // ... seller-specific logic
}
```

### Login İşlemi

```jsx
import { useCustomerAuth } from '@belucha/lib';

function LoginForm() {
  const { login } = useCustomerAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      // Backend'den token al
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      
      const { token, userId } = await response.json();
      
      // AuthContext'e login yap
      login(token, userId);
      
      // Ana sayfaya yönlendir
      router.push('/');
    } catch (error) {
      console.error('Login failed:', error);
    }
  };
  
  return (
    <form onSubmit={handleSubmit}>
      <input 
        type="email" 
        value={email} 
        onChange={(e) => setEmail(e.target.value)} 
      />
      <input 
        type="password" 
        value={password} 
        onChange={(e) => setPassword(e.target.value)} 
      />
      <button type="submit">Login</button>
    </form>
  );
}
```

---

## 🔒 Güvenlik Notları

1. **Token Storage**: Token'lar localStorage'da saklanır (gelecekte httpOnly cookie'ye geçilecek)
2. **Auto Expiry**: Expired token'lar otomatik olarak temizlenir
3. **Role Validation**: Her route access'te role kontrol edilir
4. **Server-Side Guard**: Kritik route'lar için server-side guard kullanın

---

## 🚀 Best Practices

1. **Server-Side Guard**: Kritik sayfalar için `getServerSideProps` içinde `serverSideAuthGuard` kullanın
2. **Client-Side Guard**: Genel sayfalar için `useAuthGuard` hook'unu kullanın
3. **Role Checks**: Conditional rendering için `hasRole()` kullanın
4. **Login Redirect**: Login sayfalarında `redirectIfAuthenticated: true` kullanın
5. **Error Handling**: Login/logout işlemlerinde try-catch kullanın

---

## 📝 Örnekler

### Tam Örnek: Protected Account Page

```jsx
import { useAuthGuard, useCustomerAuth } from '@belucha/lib';

export default function AccountPage() {
  // Route protection
  useAuthGuard({ requiredRole: 'customer', redirectTo: '/login' });
  
  // Auth state
  const { user, logout } = useCustomerAuth();
  
  return (
    <div>
      <h1>Account</h1>
      <p>Email: {user?.email}</p>
      <button onClick={logout}>Logout</button>
    </div>
  );
}
```

### Tam Örnek: Server-Side Protected Page

```jsx
import { serverSideAuthGuard } from '@belucha/lib';

export async function getServerSideProps(context) {
  // Route protection
  const guardResult = serverSideAuthGuard(context, {
    requiredRole: 'customer',
    redirectTo: '/login'
  });
  
  if (guardResult) return guardResult;
  
  // Fetch user data
  const userData = await fetchUserData();
  
  return {
    props: {
      userData
    }
  };
}

export default function ProtectedPage({ userData }) {
  return <div>{/* Your content */}</div>;
}
```

---

## 🐛 Troubleshooting

### Problem: "useAuth must be used within AuthProvider"

**Çözüm**: Component'inizi `CustomerAuthProvider` veya `SellerAuthProvider` ile wrap edin.

### Problem: Redirect loop

**Çözüm**: Login sayfasında `redirectIfAuthenticated: true` kullanın.

### Problem: Token expired but still authenticated

**Çözüm**: Token Service otomatik olarak expired token'ları temizler. Sayfayı yenileyin.

---

## 📚 İlgili Dokümantasyon

- [Token Service](./tokenService.js) - Token yönetimi
- [AuthContext](./AuthContext.jsx) - React Context implementation
- [Role Guards](./roleGuards.js) - Route protection

