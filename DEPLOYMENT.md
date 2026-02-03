# 🚀 Deployment Guide

How to get your Macro Calculator live on the internet in minutes!

## 🎯 Quick Start (GitHub Pages - FREE!)

### Step 1: Create a GitHub Account (if you don't have one)

1. Go to [github.com](https://github.com)
2. Click "Sign up"
3. Follow the prompts

### Step 2: Create a New Repository

1. Click the **"+"** icon in the top right → **"New repository"**
2. **Repository name**: `macro-calculator` (or any name you like)
3. **Description**: "Free macro calculator for fitness enthusiasts"
4. Make it **Public**
5. Check **"Add a README file"** (optional)
6. Click **"Create repository"**

### Step 3: Upload Your File

1. In your new repository, click **"Add file"** → **"Upload files"**
2. Drag and drop `index.html` from your computer
3. **Commit message**: "Add macro calculator"
4. Click **"Commit changes"**

### Step 4: Enable GitHub Pages

1. Go to your repository **Settings** (gear icon)
2. Scroll down the left sidebar to **"Pages"**
3. Under **"Source"**, select:
   - **Branch**: `main`
   - **Folder**: `/ (root)`
4. Click **"Save"**
5. Wait 1-2 minutes for deployment

### Step 5: Get Your URL! 🎉

Your calculator is now live at:
```
https://yourusername.github.io/macro-calculator
```

**That's it!** Share this link anywhere!

---

## 📱 Add to Instagram Bio

### Option 1: Direct Link
```
🔗 Free Macro Calculator
yourusername.github.io/macro-calculator
```

### Option 2: Use Link in Bio Tools

Popular services:
- **Linktree**: linktree.com
- **Beacons**: beacons.ai
- **Stan Store**: stan.store
- **Milkshake**: milkshake.app

Add your calculator link with a title like:
- "📊 Calculate Your Macros"
- "💪 Free Macro Calculator"
- "🎯 Find Your Perfect Macros"

---

## 🔧 Alternative Hosting Options

### Netlify (Also Free!)

1. **Go to**: [netlify.com](https://netlify.com)
2. **Sign up** with GitHub
3. **Drag and drop** your `index.html` file
4. **Get instant URL**: `yoursite.netlify.app`
5. **Custom domain** (optional): Connect your own domain

**Pros:**
- Instant deployment
- Custom domains
- Automatic HTTPS
- Fast CDN

### Vercel

1. **Go to**: [vercel.com](https://vercel.com)
2. **Sign up** with GitHub
3. **Import** your repository
4. **Deploy** automatically
5. **Get URL**: `yourproject.vercel.app`

**Pros:**
- Free tier
- Lightning fast
- Automatic deployments
- Custom domains

### Cloudflare Pages

1. **Go to**: [pages.cloudflare.com](https://pages.cloudflare.com)
2. **Connect** your GitHub account
3. **Select** your repository
4. **Deploy** with one click
5. **Get URL**: `yourproject.pages.dev`

**Pros:**
- Free unlimited bandwidth
- Cloudflare's global CDN
- Excellent performance
- DDoS protection

---

## 🌐 Custom Domain (Optional)

Want a custom domain like `macros.yourname.com`?

### Buy a Domain

Popular registrars:
- **Namecheap**: ~$10/year
- **Google Domains**: ~$12/year
- **Porkbun**: ~$8/year

### Connect to GitHub Pages

1. **Buy your domain**
2. **In your GitHub repo**, go to Settings → Pages
3. **Add custom domain**: Enter your domain (e.g., `macros.yourname.com`)
4. **In your domain registrar**, add DNS records:
   ```
   Type: CNAME
   Name: macros (or @)
   Value: yourusername.github.io
   ```
5. **Wait** 24-48 hours for DNS propagation
6. **Enable HTTPS** in GitHub Pages settings

---

## 📊 Track Your Visitors (Optional)

Want to see how many people use your calculator?

### Google Analytics (Free)

1. **Go to**: [analytics.google.com](https://analytics.google.com)
2. **Create account** and property
3. **Get tracking ID** (looks like `G-XXXXXXXXXX`)
4. **Add to your HTML** before `</head>`:

```html
<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX');
</script>
```

### Simple Analytics (Privacy-focused alternative)

- [simpleanalytics.com](https://simpleanalytics.com)
- No cookies, GDPR compliant
- Clean dashboard
- Paid (~$9/month)

---

## 🔄 Update Your Calculator

Made changes? Here's how to update:

### Via GitHub Website:

1. Go to your repository
2. Click on `index.html`
3. Click the **pencil icon** (Edit)
4. Make your changes
5. Click **"Commit changes"**
6. Changes go live in ~1 minute!

### Via Git Command Line:

```bash
# Make your changes to index.html
git add index.html
git commit -m "Update calculator design"
git push origin main
# Wait ~1 minute for deployment
```

---

## 🎨 Branding Tips

### Customize Before Deploying

1. **Change the title**:
   ```html
   <title>Your Name's Macro Calculator</title>
   ```

2. **Update the header**:
   ```html
   <h1>💪 Your Brand Name</h1>
   <p>Your tagline here</p>
   ```

3. **Change colors**:
   ```css
   --primary: #YOUR_COLOR;
   ```

4. **Update footer**:
   ```html
   <footer class="footer">
     <p>Made by <a href="https://instagram.com/yourhandle">@yourhandle</a></p>
   </footer>
   ```

---

## 📱 Social Media Sharing

### Instagram Story Template

```
💪 NEW FREE TOOL!

Calculate Your Perfect Macros

🎯 Personalized for YOUR goals
📊 Science-based calculations
📱 Works on any device

Link in bio! 👆
```

### Instagram Post Caption

```
🔥 FREE MACRO CALCULATOR 🔥

Stop guessing with your nutrition!

This FREE tool calculates your exact daily calories and macros based on:
✅ Your age, weight, height
✅ Activity level
✅ Fitness goals (cut, maintain, or bulk)

💯 100% Free
📱 Mobile-friendly
🎯 Accurate calculations

Link in bio! Drop a 💪 if you'll use it!

#macros #macrocounting #macrocounter #iifym #flexibledieting #fitness #nutrition #caloriecounting #fitnesstips #workout
```

### TikTok/Reels Script

```
"Here's a FREE tool I made for calculating your macros..."

[Show the calculator on screen]

"Just enter your stats..."
[Fill out the form]

"Select your goal..."
[Show goal options]

"And boom - your personalized macros!"
[Show results]

"Link in bio - it's completely free!"
```

---

## 🐛 Troubleshooting

### Calculator Not Loading?

1. **Clear browser cache**: Ctrl+Shift+Delete (or Cmd+Shift+Delete on Mac)
2. **Check GitHub Pages**: Settings → Pages, make sure it's enabled
3. **Wait**: Sometimes takes 5-10 minutes for first deployment

### Changes Not Showing?

1. **Hard refresh**: Ctrl+Shift+R (or Cmd+Shift+R on Mac)
2. **Clear cache**
3. **Wait 2-3 minutes** after pushing changes

### Custom Domain Not Working?

1. **Check DNS**: Use [whatsmydns.net](https://whatsmydns.net)
2. **Wait 24-48 hours** for DNS propagation
3. **Verify CNAME record** in your domain settings

---

## ✅ Pre-Launch Checklist

Before sharing your calculator:

- [ ] Test on mobile device
- [ ] Test calculations with sample data
- [ ] Update title and branding
- [ ] Add your social links in footer
- [ ] Test "Copy Results" button
- [ ] Check all buttons work
- [ ] Try both Imperial and Metric units
- [ ] Test on different browsers (Chrome, Safari, Firefox)
- [ ] Create short URL or link-in-bio
- [ ] Prepare social media posts

---

## 🎉 You're Live!

Congrats! Your macro calculator is now live and ready to help people with their fitness goals!

**Share it everywhere:**
- Instagram bio
- TikTok bio
- YouTube description
- Twitter/X bio
- Fitness forums
- Reddit (r/fitness, r/gainit, r/loseit)
- Facebook groups

**Pro tip**: Screenshot your calculator results and post them on social media with the link!

---

Need help? Open an issue on GitHub or DM me on Instagram! 💪
