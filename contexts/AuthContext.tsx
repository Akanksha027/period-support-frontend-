import React, { createContext, useState, useEffect, useContext, useRef } from 'react'
import { useAuth as useClerkAuth, useUser, useOAuth } from '@clerk/clerk-expo'
import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'
import * as AuthSession from 'expo-auth-session'
import { initializeUser, setClerkTokenGetter, updateUser } from '../lib/api'

// Complete the web browser session on native
WebBrowser.maybeCompleteAuthSession()

// Note: For React Native/Expo, Clerk automatically handles redirect URL
// using the app's deep linking scheme (period-tracker:// from app.config.js)
// No manual redirectUrl configuration needed

interface AuthContextType {
  session: any // Clerk session
  user: any // Clerk user
  loading: boolean
  oauthInProgress: boolean // Track if OAuth is currently in progress
  loginType: 'self' | 'other' | null
  signUp: (email: string, password: string) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signInWithGoogle: (loginType?: 'self' | 'other') => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  oauthInProgress: false,
  loginType: null,
  signUp: async () => {},
  signIn: async () => {},
  signInWithGoogle: async () => {},
  signOut: async () => {},
})

export const useAuth = () => useContext(AuthContext)

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const { 
    isSignedIn, 
    userId, 
    session: clerkSession, 
    getToken,
    signOut: clerkSignOut,
  } = useClerkAuth()
  const { user: clerkUser, isLoaded: userLoaded } = useUser()
  
  // Use AuthSession.makeRedirectUri() - this is the CORRECT way for Expo
  const redirectUrl = AuthSession.makeRedirectUri({
    path: 'auth/callback',
  })
  
  // Log the redirect URL on mount
  useEffect(() => {
    console.log('[AuthContext] 🔗 Redirect URL (using AuthSession.makeRedirectUri):', redirectUrl)
    console.log('[AuthContext] ⚠️ ADD THIS URL to Clerk Dashboard:')
    console.log('[AuthContext]   https://dashboard.clerk.com/ → Your App → Settings → Paths')
    console.log('[AuthContext]   Under "Allowed redirect URLs", add:', redirectUrl)
  }, [redirectUrl])
  
  const { startOAuthFlow } = useOAuth({ 
    strategy: 'oauth_google',
    redirectUrl: redirectUrl, // Use AuthSession generated URL
  })
  const [loginType, setLoginType] = useState<'self' | 'other' | null>(null)
  const [oauthInProgress, setOauthInProgress] = useState(false) // Track OAuth state
  
  // Debug logging for auth state (reduced to prevent spam)
  // Only log when auth state actually changes significantly
  const prevAuthStateRef = useRef<{ isSignedIn: boolean; userId: string | null | undefined }>({ isSignedIn: false, userId: null })
  
  useEffect(() => {
    const currentState = { isSignedIn, userId }
    const prevState = prevAuthStateRef.current
    
    // Only log if auth state changed significantly
    if (prevState.isSignedIn !== currentState.isSignedIn || prevState.userId !== currentState.userId) {
      console.log('[AuthContext] Auth State Update:', {
        isSignedIn,
        userId,
        userLoaded,
        hasUser: !!clerkUser,
      })
      prevAuthStateRef.current = currentState
    }
  }, [isSignedIn, userId, userLoaded, clerkUser])

  // Set up Clerk token getter for API client
  useEffect(() => {
    setClerkTokenGetter(async () => {
      try {
        // IMPORTANT: Don't check isSignedIn here - it might be false even if there's a session
        // This happens right after OAuth when hooks haven't updated yet
        // Instead, try to get the token and let Clerk's getToken() handle the check
        
        // Get token - try without template first, then with template if needed
        let token = null
        try {
          // Try to get token - Clerk's getToken() will return null if no session exists
          token = await getToken()
          if (token) {
            // Token retrieved successfully - no need to log here (will be logged during OAuth flow)
            return token
          }
        } catch (err: any) {
          // If getting token without template fails, try with default template
          // This might work even if the first attempt failed
          try {
            token = await getToken({ template: 'default' })
            if (token) {
              // Token retrieved successfully - no need to log here (will be logged during OAuth flow)
              return token
            }
          } catch (templateErr: any) {
            // Only log if it's not a "no session" error (which is expected when not logged in)
            if (templateErr?.errors?.[0]?.code !== 'session_not_found' && 
                !templateErr?.message?.includes('session') &&
                !templateErr?.message?.includes('No active session')) {
              console.warn('[AuthContext] Token retrieval failed:', templateErr?.message || templateErr)
            }
          }
        }
        
        // No token available - return null
        // This is expected when user is not logged in or session is not ready yet
        return null
      } catch (error: any) {
        // Don't log errors during normal flow (user might not be signed in)
        // Only log unexpected errors
        if (error?.message && 
            !error.message.includes('session') && 
            !error.message.includes('No active session')) {
          console.warn('[AuthContext] Token error:', error.message)
        }
        return null
      }
    })
  }, [getToken, clerkSession]) // Use clerkSession instead of isSignedIn - it updates more reliably

  // Track if initialization is in progress to avoid duplicate calls
  // Use ref to prevent infinite loops - refs don't trigger re-renders
  const initializingUserRef = useRef(false)
  const initializationAttemptedRef = useRef<string | null>(null)
  const initializationSuccessRef = useRef<string | null>(null)
  
  // Reset initialization tracking when user signs out or changes
  useEffect(() => {
    if (!isSignedIn || !userId) {
      initializationAttemptedRef.current = null
      initializationSuccessRef.current = null
      initializingUserRef.current = false
    } else if (userId !== initializationAttemptedRef.current) {
      // New user - reset tracking
      initializationAttemptedRef.current = null
      initializationSuccessRef.current = null
      initializingUserRef.current = false
    }
  }, [isSignedIn, userId])
  
  // Add a diagnostic effect to track auth state changes after OAuth
  useEffect(() => {
    // This helps diagnose if OAuth completed but hooks haven't updated
    if (clerkSession && !isSignedIn) {
      console.log('[AuthContext] ⚠️ DIAGNOSTIC: Session exists but isSignedIn is false - hooks may not have updated yet')
      console.log('[AuthContext] Session ID:', clerkSession?.id?.substring(0, 20) + '...')
      console.log('[AuthContext] This is normal right after OAuth - hooks will update soon')
    }
  }, [clerkSession, isSignedIn])
  
  // IMPORTANT: Detect when OAuth completes via auth state changes
  // This handles cases where OAuth promise doesn't resolve but auth state updates
  useEffect(() => {
    if (oauthInProgress && isSignedIn && userId && clerkUser) {
      console.log('='.repeat(80))
      console.log('[AuthContext] 🎉 OAUTH COMPLETED DETECTED VIA AUTH STATE!')
      console.log('[AuthContext] OAuth promise may not have resolved, but user is now signed in')
      console.log('[AuthContext] User ID:', userId)
      console.log('[AuthContext] User Email:', clerkUser?.emailAddresses?.[0]?.emailAddress)
      console.log('[AuthContext] Setting oauthInProgress to false to allow navigation...')
      console.log('='.repeat(80))
      // OAuth completed successfully (detected via auth state)
      setOauthInProgress(false)
    }
  }, [oauthInProgress, isSignedIn, userId, clerkUser])
  
  // IMPORTANT: Log token whenever user becomes available (after login)
  // This ensures we see the token even if OAuth completes quickly
  const tokenLoggedRef = useRef<string | null>(null) // Track which user's token we've logged
  useEffect(() => {
    if (isSignedIn && userId && clerkUser && !oauthInProgress) {
      // Only log token once per user (to avoid spam)
      if (tokenLoggedRef.current === userId) {
        return // Already logged for this user
      }
      
      // User just logged in - immediately fetch and log the token
      console.log('[AuthContext] 🔍 User detected - fetching token to verify...')
      console.log('[AuthContext] User ID:', userId)
      console.log('[AuthContext] User Email:', clerkUser?.emailAddresses?.[0]?.emailAddress)
      
      getToken()
        .then((token) => {
          if (token) {
            tokenLoggedRef.current = userId // Mark as logged
            console.log('='.repeat(80))
            console.log('[AuthContext] 🔑 TOKEN VERIFICATION - USER LOGGED IN')
            console.log('[AuthContext] User ID:', userId)
            console.log('[AuthContext] User Email:', clerkUser?.emailAddresses?.[0]?.emailAddress)
            console.log('[AuthContext] Token length:', token.length)
            console.log('[AuthContext] Token preview (first 50 chars):', token.substring(0, 50) + '...')
            console.log('[AuthContext] Token preview (last 30 chars):', '...' + token.substring(token.length - 30))
            console.log('[AuthContext] Full token:', token)
            console.log('='.repeat(80))
          } else {
            // Try with template
            getToken({ template: 'default' })
              .then((templateToken) => {
                if (templateToken) {
                  tokenLoggedRef.current = userId // Mark as logged
                  console.log('='.repeat(80))
                  console.log('[AuthContext] 🔑 TOKEN VERIFICATION (with template) - USER LOGGED IN')
                  console.log('[AuthContext] User ID:', userId)
                  console.log('[AuthContext] User Email:', clerkUser?.emailAddresses?.[0]?.emailAddress)
                  console.log('[AuthContext] Token length:', templateToken.length)
                  console.log('[AuthContext] Token preview (first 50 chars):', templateToken.substring(0, 50) + '...')
                  console.log('[AuthContext] Token preview (last 30 chars):', '...' + templateToken.substring(templateToken.length - 30))
                  console.log('[AuthContext] Full token:', templateToken)
                  console.log('='.repeat(80))
                } else {
                  console.warn('[AuthContext] ⚠️ User is signed in but token is not available yet')
                }
              })
              .catch((err) => {
                console.warn('[AuthContext] ⚠️ Could not get token with template:', err?.message)
              })
          }
        })
        .catch((err) => {
          console.warn('[AuthContext] ⚠️ Could not get token:', err?.message)
        })
    } else if (!isSignedIn || !userId) {
      // User logged out - reset token log tracking
      tokenLoggedRef.current = null
    }
  }, [isSignedIn, userId, clerkUser, oauthInProgress, getToken])
  
  useEffect(() => {
    // Initialize user in database if signed in
    // Only initialize once per user ID to prevent infinite loops
    // Note: We check isSignedIn here, but also check if we have a session as fallback
    if ((isSignedIn || clerkSession) && clerkUser && userId && userLoaded) {
      // Check if we've already successfully initialized for this user
      if (initializationSuccessRef.current === userId) {
        return // Already successfully initialized
      }
      
      // Check if we've already attempted initialization for this user (and it's still in progress)
      if (initializationAttemptedRef.current === userId && initializingUserRef.current) {
        return // Already attempting for this user
      }
      
      // Check if initialization is already in progress for a different user
      if (initializingUserRef.current && initializationAttemptedRef.current !== userId) {
        return // Wait for previous initialization to complete
      }
      
      initializingUserRef.current = true
      initializationAttemptedRef.current = userId
      
      initializeUserInDatabase()
        .then(() => {
          // Mark as successful
          initializationSuccessRef.current = userId
        })
        .finally(() => {
          // Reset after a delay to allow retry if needed, but prevent rapid re-initialization
          setTimeout(() => {
            initializingUserRef.current = false
            // Only reset attempted if it wasn't successful (to allow retry)
            if (initializationSuccessRef.current !== userId) {
              initializationAttemptedRef.current = null
            }
          }, 10000) // Increased to 10 seconds to prevent rapid retries
        })
    }
  }, [isSignedIn, userLoaded, clerkUser, userId])

  const initializeUserInDatabase = async () => {
    try {
      console.log('[AuthContext] Initializing user in database...')
      console.log('[AuthContext] User ID:', userId)
      console.log('[AuthContext] User email:', clerkUser?.emailAddresses?.[0]?.emailAddress)
      console.log('[AuthContext] Is signed in:', isSignedIn)
      
      // Wait for token to be available (with retries)
      // IMPORTANT: Don't rely on isSignedIn - it might be false even with a valid session
      // Right after OAuth, hooks take time to update
      let token = null
      let attempts = 0
      const maxAttempts = 30 // Increased attempts for slower connections and hook updates
      
      console.log('[AuthContext] Waiting for token to be available...')
      console.log('[AuthContext] Auth state:', { 
        isSignedIn, 
        userId, 
        hasUser: !!clerkUser,
        hasSession: !!clerkSession 
      })
      
      // First, wait a bit for session to be established (if needed)
      // Note: clerkSession is from React hook, so we just wait a bit for it to update
      if (!clerkSession && !isSignedIn) {
        console.log('[AuthContext] Session not available yet, waiting for React state to update...')
        // Give React time to update the session state
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
      
      while (!token && attempts < maxAttempts) {
        try {
          // Try without template first (most common case)
          // Don't check isSignedIn - getToken() will return null if no session
          token = await getToken()
          if (!token) {
            // If no token, try with default template
            token = await getToken({ template: 'default' })
          }
          
          if (token) {
            console.log('[AuthContext] ✅ Token available, proceeding with initialization')
            console.log('[AuthContext] Current state:', {
              isSignedIn,
              hasUserId: !!userId,
              hasUser: !!clerkUser,
              hasSession: !!clerkSession,
            })
            break
          }
        } catch (err: any) {
          // Only log if it's not a "no session" error (expected when not logged in)
          const isNoSessionError = err?.errors?.[0]?.code === 'session_not_found' ||
                                   err?.message?.includes('session') ||
                                   err?.message?.includes('No active session')
          
          if (attempts < 3 || attempts % 5 === 0) {
            console.log('[AuthContext] Token not ready yet, attempt', attempts + 1, 'of', maxAttempts)
            if (!isNoSessionError) {
              console.log('[AuthContext] Error:', err?.message || 'Unknown error')
            }
            console.log('[AuthContext] Current auth state:', { 
              isSignedIn, 
              userId: userId?.substring(0, 10) + '...' || null,
              hasSession: !!clerkSession,
              hasUser: !!clerkUser,
            })
          }
        }
        attempts++
        await new Promise(resolve => setTimeout(resolve, 400))
      }
      
      if (!token) {
        console.error('[AuthContext] ❌ Could not get token after', maxAttempts, 'attempts')
        console.error('[AuthContext] Current auth state:', { 
          isSignedIn, 
          userId, 
          hasUser: !!clerkUser,
          userLoaded 
        })
        console.error('[AuthContext] This might happen if session is not fully established yet')
        // Don't throw - let the retry mechanism handle it, but log more details
        return
      }
      
      // Initialize user in database (creates if doesn't exist, syncs if exists)
      const dbUser = await initializeUser()
      console.log('[AuthContext] ✅ User initialized successfully:', dbUser.email)
      
      // Mark initialization as successful
      initializationSuccessRef.current = userId
      
      // Update user name if available from Clerk and not set in database
      if (clerkUser?.firstName || clerkUser?.lastName) {
        const fullName = `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim()
        if (fullName && (!dbUser.name || dbUser.name !== fullName)) {
          try {
            await updateUser(fullName)
            console.log('[AuthContext] User name synced:', fullName)
          } catch (err) {
            console.error('[AuthContext] Failed to sync user name:', err)
          }
        }
      }
    } catch (error: any) {
      console.error('[AuthContext] Failed to initialize user:', error)
      if (error.response?.status === 401) {
        console.error('[AuthContext] 401 Unauthorized - Token might not be ready yet')
        console.error('[AuthContext] Will retry when token becomes available (through useEffect)')
        // Don't mark as successful - allow retry when token becomes available
        // The useEffect will retry when auth state changes (e.g., when token becomes available)
        // This prevents infinite retry loops while still allowing recovery
        return
      }
      // For other errors, also don't retry automatically
      // The component can handle retries through the useEffect when conditions change
      console.error('[AuthContext] Initialization failed with error:', error.message)
    }
  }

  const signUp = async (email: string, password: string) => {
    // Clerk handles sign up through their UI components
    // This is a placeholder - you might want to use Clerk's <SignUp /> component
    throw new Error('Please use Clerk sign up component')
  }

  const signIn = async (email: string, password: string) => {
    // Clerk handles sign in through their UI components
    // This is a placeholder - you might want to use Clerk's <SignIn /> component
    throw new Error('Please use Clerk sign in component')
  }

  const signInWithGoogle = async (loginType: 'self' | 'other' = 'self') => {
    // Mark OAuth as in progress - this will prevent navigation
    setOauthInProgress(true)
    
    // Set up deep link listener to track if redirect happens
    const deepLinkSubscription = Linking.addEventListener('url', (event) => {
      console.log('[AuthContext] 🔗 Deep link received:', event.url)
      console.log('[AuthContext] Expected redirect URL contains:', redirectUrl)
      if (event.url.includes('auth/callback') || event.url.includes(redirectUrl)) {
        console.log('[AuthContext] ✅ OAuth callback deep link detected!')
      }
    })
    
    // Also check initial URL in case app was opened via deep link
    Linking.getInitialURL().then((url) => {
      if (url) {
        console.log('[AuthContext] 🔗 Initial URL detected:', url)
      }
    }).catch((err) => {
      console.log('[AuthContext] No initial URL:', err)
    })
    
    try {
      console.log('='.repeat(50))
      console.log('[AuthContext] ========== STARTING GOOGLE OAUTH ==========')
      console.log('[AuthContext] Login Type:', loginType)
      console.log('[AuthContext] Redirect URL (auto-generated):', redirectUrl)
      console.log('[AuthContext] Current Auth State:', {
        isSignedIn,
        userId,
        userLoaded,
        hasUser: !!clerkUser,
      })
      console.log('[AuthContext] 🔒 OAuth in progress - navigation will be blocked until complete')
      setLoginType(loginType)
      
      console.log('[AuthContext] Step 1: Calling startOAuthFlow...')
      console.log('[AuthContext] Redirect URL:', redirectUrl)
      console.log('[AuthContext] ⚠️ Browser should open NOW for Google login')
      console.log('[AuthContext]')
      console.log('[AuthContext] ⚠️⚠️⚠️ IF BROWSER DOESN\'T OPEN:')
      console.log('[AuthContext]   1. Check device permissions')
      console.log('[AuthContext]   2. Add redirect URL to Clerk Dashboard:', redirectUrl)
      console.log('[AuthContext]')
      console.log('='.repeat(80))
      console.log('[AuthContext] ⚠️⚠️⚠️ CRITICAL SETUP REQUIRED ⚠️⚠️⚠️')
      console.log('[AuthContext] The OAuth flow will hang if this is not done:')
      console.log('[AuthContext]')
      console.log('[AuthContext] STEP 1: Go to https://dashboard.clerk.com/')
      console.log('[AuthContext] STEP 2: Select your application')
      console.log('[AuthContext] STEP 3: Go to Settings → Paths (or Redirect URLs)')
      console.log('[AuthContext] STEP 4: Under "Allowed redirect URLs", click "Add URL"')
      console.log('[AuthContext] STEP 5: Add this EXACT URL (copy it exactly):')
      console.log('[AuthContext]')
      console.log('[AuthContext]   ' + redirectUrl)
      console.log('[AuthContext]')
      console.log('[AuthContext] STEP 6: Also add the production URL:')
      console.log('[AuthContext]   period-tracker://auth/callback')
      console.log('[AuthContext]')
      console.log('[AuthContext] STEP 7: Save the changes')
      console.log('[AuthContext] STEP 8: Restart your Expo app')
      console.log('='.repeat(80))
      const startTime = Date.now()
      
      // Add timeout for OAuth flow with progress updates
      let oauthPromise: Promise<any>
      try {
        console.log('[AuthContext] Step 1.1: Calling startOAuthFlow() function...')
        console.log('[AuthContext] Step 1.1.1: About to call startOAuthFlow, this should open browser...')
        oauthPromise = startOAuthFlow()
        console.log('[AuthContext] Step 1.2: startOAuthFlow() called, promise created')
        console.log('[AuthContext] Step 1.3: Promise created, waiting for browser to open...')
        console.log('[AuthContext] Step 1.4: If browser doesn\'t open, check:')
        console.log('[AuthContext]   - Device permissions for browser')
        console.log('[AuthContext]   - Expo Go app permissions')
        console.log('[AuthContext]   - Redirect URL in Clerk Dashboard')
      } catch (initError: any) {
        console.error('[AuthContext] ❌ ERROR: Failed to call startOAuthFlow:', initError)
        console.error('[AuthContext] Error details:', {
          message: initError?.message,
          name: initError?.name,
          stack: initError?.stack?.substring(0, 300),
        })
        deepLinkSubscription.remove()
        throw new Error(`Failed to start OAuth flow: ${initError?.message || 'Unknown error'}`)
      }
      
      // Progress logging every 3 seconds (more frequent for debugging)
      // Also check if auth state has updated (OAuth might have completed)
      const progressInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000)
        console.log(`[AuthContext] ⏳ Still waiting... (${elapsed}s elapsed)`)
        console.log('[AuthContext] Current auth state:', {
          isSignedIn,
          hasUserId: !!userId,
          hasUser: !!clerkUser,
          hasSession: !!clerkSession,
        })
        
        // Check if OAuth completed via auth state (even if promise didn't resolve)
        if (isSignedIn && userId && clerkUser) {
          console.log('[AuthContext] ✅ AUTH STATE DETECTED: User is signed in!')
          console.log('[AuthContext] OAuth may have completed - checking if we should proceed...')
        }
        
        console.log('[AuthContext] 💡 If this hangs, check:')
        console.log('[AuthContext]   1. Did browser open for Google login?')
        console.log('[AuthContext]   2. Did you complete Google login in browser?')
        console.log('[AuthContext]   3. Did you add redirect URL to Clerk Dashboard?')
        console.log('[AuthContext]   4. Redirect URL should be:', redirectUrl)
        console.log('[AuthContext]   5. Check if deep linking is configured in app.config.js')
      }, 3000)
      
      // Note: We use a useEffect (above) to detect OAuth completion via auth state
      // This Promise.race will wait for either:
      // 1. OAuth promise to resolve (normal case)
      // 2. Timeout (error case)
      // The useEffect will handle the case where auth state updates but promise doesn't resolve
      
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          clearInterval(progressInterval)
          reject(new Error(`OAuth flow timed out after 90 seconds. 
Check:
1. Browser opened for Google login?
2. Redirect URL added to Clerk Dashboard: ${redirectUrl}
3. Deep linking configured in app.config.js?
4. Completed Google login in browser?
5. Current auth state: isSignedIn=${isSignedIn}, hasUserId=${!!userId}, hasUser=${!!clerkUser}`))
        }, 90000) // Increased to 90 seconds
      })
      
      // Start Clerk OAuth flow with timeout
      console.log('[AuthContext] Step 2: Waiting for OAuth flow to complete...')
      console.log('[AuthContext] ℹ️ Clerk will handle redirect automatically for React Native')
      console.log('[AuthContext] ℹ️ This may take up to 90 seconds...')
      
      let result: any
      try {
        console.log('[AuthContext] Step 2.1: Starting Promise.race - waiting for OAuth or timeout...')
        console.log('[AuthContext] Note: If OAuth completes but promise doesn\'t resolve, useEffect will detect it via auth state')
        result = await Promise.race([oauthPromise, timeoutPromise]) as any
        clearInterval(progressInterval)
        deepLinkSubscription.remove()
        console.log('[AuthContext] ✅ OAuth promise resolved!')
        console.log('[AuthContext] Step 2.2: OAuth completed successfully!')
      } catch (raceError: any) {
        clearInterval(progressInterval)
        deepLinkSubscription.remove()
        console.error('[AuthContext] ❌ ERROR: OAuth flow failed or timed out')
        console.error('[AuthContext] Error type:', raceError?.name)
        console.error('[AuthContext] Error message:', raceError?.message)
        console.error('[AuthContext] Full error:', raceError)
        console.error('[AuthContext] Error stack:', raceError?.stack?.substring(0, 500))
        
        // Check if it's a timeout or actual error
        if (raceError?.message?.includes('timed out')) {
          console.error('[AuthContext] ⚠️ TIMEOUT: OAuth flow timed out after 90 seconds')
          console.error('[AuthContext] ⚠️ This usually means:')
          console.error('[AuthContext]   1. Browser didn\'t open')
          console.error('[AuthContext]   2. User didn\'t complete login in browser')
          console.error('[AuthContext]   3. Redirect URL not in Clerk Dashboard:', redirectUrl)
          console.error('[AuthContext]   4. Deep link not working')
          console.error('[AuthContext] ⚠️ ACTION REQUIRED:')
          console.error('[AuthContext]   - Verify redirect URL in Clerk Dashboard:', redirectUrl)
          console.error('[AuthContext]   - Check if browser opened when you clicked login')
          console.error('[AuthContext]   - Complete Google login in browser if it opened')
          setOauthInProgress(false)
          throw new Error(`OAuth flow timed out. ${raceError.message}`)
        } else if (raceError?.errors) {
          // Clerk-specific errors
          const clerkError = raceError.errors[0]
          console.error('[AuthContext] Clerk error code:', clerkError?.code)
          console.error('[AuthContext] Clerk error message:', clerkError?.message)
          setOauthInProgress(false)
          throw new Error(`OAuth failed: ${clerkError?.message || 'Unknown Clerk error'}`)
        } else {
          setOauthInProgress(false)
          throw raceError
        }
      }
      const elapsedTime = Date.now() - startTime
      console.log('[AuthContext] Step 3: OAuth flow completed in', elapsedTime, 'ms')
      console.log('[AuthContext] OAuth result keys:', Object.keys(result || {}))
      
      // Safe logging without circular references
      try {
        const safeResult = {
          createdSessionId: result?.createdSessionId,
          hasSignIn: !!result?.signIn,
          hasSignUp: !!result?.signUp,
          signInSessionId: result?.signIn?.createdSessionId,
          signUpSessionId: result?.signUp?.createdSessionId,
          hasSetActive: typeof result?.setActive === 'function',
        }
        console.log('[AuthContext] OAuth result (safe):', safeResult)
      } catch (err) {
        console.log('[AuthContext] OAuth result received (cannot stringify)')
      }
      
      if (!result) {
        throw new Error('OAuth flow returned null/undefined result')
      }
      
      const { createdSessionId, setActive, signIn, signUp } = result
      const sessionId = createdSessionId || signIn?.createdSessionId || signUp?.createdSessionId
      
      console.log('[AuthContext] Step 4: Extracted session ID:', sessionId)
      console.log('[AuthContext] Session sources:', {
        createdSessionId,
        signInSessionId: signIn?.createdSessionId,
        signUpSessionId: signUp?.createdSessionId,
      })
      
      if (sessionId) {
        console.log('[AuthContext] Step 5: Setting active session...')
        // Set the active session
        await setActive({ session: sessionId })
        console.log('[AuthContext] Step 6: Session activated successfully!')
        console.log('[AuthContext] Step 7: Waiting for user to load...')
        
        // Wait a bit for user state to update and token to be available
        console.log('[AuthContext] Step 7: Waiting for user state and token to be ready...')
        
        // Wait for token to be available before proceeding
        // Also wait for Clerk hooks to update (isSignedIn, userId, etc.)
        let tokenReady = false
        let hooksReady = false
        let tokenAttempts = 0
        const maxTokenAttempts = 30 // Increased to give more time for hooks to update
        
        console.log('[AuthContext] Step 7.1: Waiting for token AND Clerk hooks to be ready...')
        console.log('[AuthContext] Initial state after setActive:', {
          isSignedIn,
          userId,
          hasUser: !!clerkUser,
          hasSession: !!clerkSession,
        })
        
        while ((!tokenReady || !hooksReady) && tokenAttempts < maxTokenAttempts) {
          // Check if hooks are ready
          if (isSignedIn && userId && clerkUser) {
            hooksReady = true
            if (tokenAttempts === 0 || tokenAttempts % 5 === 0) {
              console.log('[AuthContext] ✅ Clerk hooks are ready:', { isSignedIn, userId: userId?.substring(0, 10) + '...' })
            }
          }
          
          // Try to get token
          try {
            let testToken = await getToken()
            if (!testToken) {
              // Try with template
              testToken = await getToken({ template: 'default' })
            }
            
            if (testToken) {
              tokenReady = true
              // Log the token details for verification
              console.log('='.repeat(80))
              console.log('[AuthContext] 🔑 TOKEN RETRIEVED SUCCESSFULLY AFTER GOOGLE LOGIN')
              console.log('[AuthContext] Token length:', testToken.length)
              console.log('[AuthContext] Token preview (first 50 chars):', testToken.substring(0, 50) + '...')
              console.log('[AuthContext] Token preview (last 30 chars):', '...' + testToken.substring(testToken.length - 30))
              console.log('[AuthContext] Full token:', testToken)
              console.log('='.repeat(80))
              
              if (hooksReady) {
                console.log('[AuthContext] ✅ Token is ready AND hooks are ready!')
                break
              } else {
                console.log('[AuthContext] ✅ Token is ready, but hooks not yet updated')
              }
            }
          } catch (err: any) {
            // Token not ready yet - this is expected during the transition
            if (tokenAttempts < 3 || tokenAttempts % 5 === 0) {
              console.log('[AuthContext] Waiting... (attempt', tokenAttempts + 1, ')', {
                hasToken: tokenReady,
                hooksReady: hooksReady,
                isSignedIn,
                hasUserId: !!userId,
                hasUser: !!clerkUser,
              })
            }
          }
          
          tokenAttempts++
          await new Promise(resolve => setTimeout(resolve, 300))
        }
        
        if (!tokenReady || !hooksReady) {
          console.warn('[AuthContext] ⚠️ Not fully ready after', maxTokenAttempts, 'attempts:', {
            tokenReady,
            hooksReady,
            isSignedIn,
            hasUserId: !!userId,
            hasUser: !!clerkUser,
          })
          console.warn('[AuthContext] Continuing anyway - hooks should update soon...')
        }
        
        // Give a bit more time for user state to sync
        await new Promise(resolve => setTimeout(resolve, 500))
        
        // Final token verification - get token one more time and log it
        try {
          let finalToken = await getToken()
          if (!finalToken) {
            finalToken = await getToken({ template: 'default' })
          }
          if (finalToken) {
            console.log('='.repeat(80))
            console.log('[AuthContext] 🔑 FINAL TOKEN VERIFICATION AFTER GOOGLE LOGIN')
            console.log('[AuthContext] Token successfully retrieved:', finalToken.length, 'characters')
            console.log('[AuthContext] Token (first 100 chars):', finalToken.substring(0, 100) + '...')
            console.log('[AuthContext] Full token:', finalToken)
            console.log('='.repeat(80))
          } else {
            console.warn('[AuthContext] ⚠️ Could not retrieve token in final verification')
          }
        } catch (tokenErr) {
          console.error('[AuthContext] Error in final token verification:', tokenErr)
        }
        
        console.log('[AuthContext] Step 8: Final state after waiting:', {
          isSignedIn,
          userId: userId?.substring(0, 10) + '...',
          userLoaded,
          hasUser: !!clerkUser,
          tokenReady,
          hooksReady,
          hasSession: !!clerkSession,
        })
        
        // Store login type in user metadata after session is set
        setTimeout(async () => {
          console.log('[AuthContext] Step 9: Attempting to update metadata...')
          // Retry mechanism to wait for clerkUser to be available
          let attempts = 0
          const maxAttempts = 5
          const checkAndUpdate = async () => {
            console.log('[AuthContext] Metadata update attempt', attempts + 1, '- hasUser:', !!clerkUser)
            if (clerkUser) {
              try {
                await clerkUser.update({
                  publicMetadata: {
                    loginType: loginType,
                  },
                })
                console.log('[AuthContext] ✅ Login type stored in metadata:', loginType)
              } catch (err: any) {
                console.error('[AuthContext] ❌ Failed to update metadata:', err.message)
              }
            } else if (attempts < maxAttempts) {
              attempts++
              setTimeout(checkAndUpdate, 500)
            } else {
              console.warn('[AuthContext] ⚠️ Could not update metadata - user not loaded after', maxAttempts, 'attempts')
            }
          }
          checkAndUpdate()
        }, 1500)
        
        console.log('[AuthContext] ========== GOOGLE OAUTH SUCCESSFUL ==========')
        console.log('='.repeat(50))
        // OAuth completed successfully - allow navigation
        setOauthInProgress(false)
      } else {
        console.error('[AuthContext] ❌ No session ID found in result')
        // Safe logging without circular references
        try {
          const safeResult = {
            hasCreatedSessionId: !!result?.createdSessionId,
            hasSignIn: !!result?.signIn,
            hasSignUp: !!result?.signUp,
            keys: Object.keys(result || {}),
          }
          console.error('[AuthContext] Result summary:', safeResult)
        } catch {
          console.error('[AuthContext] Result received but cannot log details (circular reference)')
        }
        throw new Error('OAuth completed but no session was created. Please try again.')
      }
    } catch (error: any) {
      console.error('='.repeat(50))
      console.error('[AuthContext] ========== GOOGLE OAUTH FAILED ==========')
      
      // Safe error logging without circular references
      try {
        console.error('[AuthContext] Error message:', error?.message || 'Unknown error')
        console.error('[AuthContext] Error name:', error?.name)
        
        if (error?.stack) {
          console.error('[AuthContext] Error stack:', error.stack)
        }
        
        if (error?.errors) {
          try {
            const safeErrors = error.errors.map((e: any) => ({
              message: e?.message,
              code: e?.code,
              longMessage: e?.longMessage,
            }))
            console.error('[AuthContext] Error details:', safeErrors)
          } catch {
            console.error('[AuthContext] Error details: (cannot stringify)')
          }
        }
      } catch (logError) {
        console.error('[AuthContext] Error occurred (cannot log details):', logError)
      }
      
      console.error('='.repeat(50))
      
      // OAuth failed - allow navigation again (user can try again)
      setOauthInProgress(false)
      
      // Handle specific error cases
      if (error?.message?.includes('cancelled') || error?.errors?.[0]?.message === 'User cancelled') {
        throw new Error('Sign in cancelled')
      }
      
      if (error?.message?.includes('timed out')) {
        throw new Error('Sign in timed out. Please check your internet connection and try again.')
      }
      
      throw error
    }
  }

  const signOut = async () => {
    await clerkSignOut()
    setLoginType(null)
  }

  // Log context value changes (reduced logging to prevent spam)
  // Only log significant state changes, not every render
  const prevStateRef = useRef<{ userId: string | null | undefined; isSignedIn: boolean }>({ userId: null, isSignedIn: false })
  
  useEffect(() => {
    const currentState = { userId, isSignedIn }
    const prevState = prevStateRef.current
    
    // Only log if there's a significant change (auth state or user ID)
    if (prevState.userId !== currentState.userId || prevState.isSignedIn !== currentState.isSignedIn) {
      console.log('[AuthContext] 📦 Auth State Changed:', {
        hasSession: !!clerkSession,
        hasUser: !!clerkUser,
        userId: userId,
        isSignedIn,
        loginType,
      })
      prevStateRef.current = currentState
    }
  }, [clerkSession, clerkUser, userId, userLoaded, isSignedIn, loginType])

  // Loading state includes: Clerk loading, OAuth in progress, or user initialization
  const isLoading = !userLoaded || oauthInProgress
  
  return (
    <AuthContext.Provider
      value={{
        session: clerkSession,
        user: clerkUser,
        loading: isLoading,
        oauthInProgress,
        loginType,
        signUp,
        signIn,
        signInWithGoogle,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

