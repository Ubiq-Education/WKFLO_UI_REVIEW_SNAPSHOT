// client/src/pages/Login.js
import React from 'react';
import { Button } from "@/components/ui/button"; // Import your Button component

import { useMsal } from '@azure/msal-react';
import { loginRequest } from '../authConfig';

const Login = () => {
    const { instance } = useMsal();

    const handleLogin = () => {
        instance.loginRedirect({ ...loginRequest, prompt: "select_account" }).catch((error) => {
            console.error("Login failed: ", error);
        });
    };

    return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="bg-white p-6 rounded-md shadow-md w-1/3">
        <h1 className="text-center text-2xl font-semibold mb-4">Login</h1>
        <Button 
          onClick={handleLogin} 
          className="w-full mt-4 text-lg cursor-pointer"
        >
          Log in with Azure
        </Button>
      </div>
    </div>
  );
}

export default Login;