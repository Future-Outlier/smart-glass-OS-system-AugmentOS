import React, { useState } from 'react';

const UpdatePasswordForm = ({ 
  logoUrl = "https://imagedelivery.net/nrc8B2Lk8UIoyW7fY8uHVg/757b23a3-9ec0-457d-2634-29e28f03fe00/verysmall"
}) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const isPasswordValid = newPassword.length >= 6;
  const doPasswordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;
  const isFormValid = isPasswordValid && doPasswordsMatch;

  const handleSubmit = async () => {
    if (!isFormValid) {
      setErrorMessage('Please ensure passwords match and are at least 6 characters');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      // Replace with actual Supabase call:
      // const { error } = await supabase.auth.updateUser({ password: newPassword });
      // if (error) throw error;
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Success
      setSuccessMessage('Password updated successfully! You can now sign in with your new password.');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      setErrorMessage(error.message || 'Failed to update password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && isFormValid && !isLoading) {
      handleSubmit();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" style={{ width: '100%' }}>
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8" style={{ maxWidth: '100%' }}>
        <div className="w-full max-w-md mx-auto flex flex-col items-center" style={{ maxWidth: '28rem' }}>
          {/* Logo */}
          <img src={logoUrl} alt="Logo" />
          
          {/* Header */}
          <div className="w-full text-center mt-6 mb-6">
            <h1 className="text-2xl font-bold mb-2">
              Update your password
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Enter your new password below
            </p>
          </div>

          {/* Card */}
          <div className="w-full bg-white p-8 rounded-lg shadow-md">
            <div className="w-full space-y-4">
              {/* New Password Input */}
              <div>
                <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-2">
                  New password
                </label>
                <input
                  type="password"
                  id="newPassword"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Enter new password"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  disabled={isLoading}
                  autoFocus
                />
                {newPassword.length > 0 && newPassword.length < 6 && (
                  <p className="text-xs text-red-600 mt-1">Password must be at least 6 characters</p>
                )}
              </div>

              {/* Confirm Password Input */}
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                  Confirm new password
                </label>
                <input
                  type="password"
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Confirm new password"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  disabled={isLoading}
                />
                {confirmPassword.length > 0 && !doPasswordsMatch && (
                  <p className="text-xs text-red-600 mt-1">Passwords do not match</p>
                )}
              </div>

              {/* Submit Button */}
              <button
                onClick={handleSubmit}
                disabled={!isFormValid || isLoading}
                className="w-full py-2 bg-emerald-400 hover:bg-emerald-500 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium rounded text-sm transition-colors duration-200"
                style={{ borderRadius: '4px', fontSize: '14px', fontWeight: '500' }}
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Updating...
                  </span>
                ) : (
                  'Update password'
                )}
              </button>

              {/* Success Message */}
              {successMessage && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                  <p className="text-sm text-green-700 text-center">
                    {successMessage}
                  </p>
                </div>
              )}

              {/* Error Message */}
              {errorMessage && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-700 text-center">
                    {errorMessage}
                  </p>
                </div>
              )}
            </div>

            {/* Sign In Link */}
            <div className="text-center text-sm text-gray-500 mt-6">
              <p
                onClick={() => console.log('Navigate to sign in')}
                className="cursor-pointer underline"
              >
                Back to sign in
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default UpdatePasswordForm;