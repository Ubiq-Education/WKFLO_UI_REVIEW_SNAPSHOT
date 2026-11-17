import { useLocation } from "wouter";
import { Store, Search, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function MarketplacePage() {
  const [_, navigate] = useLocation();

  const marketplaceOptions = [
    {
      title: "Browse Marketplace",
      description: "Explore and discover new tools, plugins, and extensions",
      icon: Search,
      href: "/marketplace/browse",
      color: "bg-blue-500"
    },
    {
      title: "My Purchases",
      description: "View and manage your purchased items and subscriptions",
      icon: ShoppingCart,
      href: "/marketplace/purchases", 
      color: "bg-green-500"
    }
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-secondary">
      <div className="flex items-center mb-6">
        <Store className="mr-3 h-8 w-8 text-orange-500" />
        <h1 className="text-2xl font-semibold">Marketplace</h1>
      </div>
      
      <div className="mb-6">
        <p className="text-gray-600">
          Discover and manage marketplace tools, plugins, and extensions for your workflow automation.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
        {marketplaceOptions.map((option) => {
          const IconComponent = option.icon;
          return (
            <Card 
              key={option.href}
              className="cursor-pointer transition-all hover:shadow-lg hover:scale-105"
              onClick={() => navigate(option.href)}
            >
              <CardHeader className="pb-4">
                <div className="flex items-center space-x-3">
                  <div className={`p-3 rounded-lg ${option.color} text-white`}>
                    <IconComponent className="h-6 w-6" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">{option.title}</CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-gray-600">
                  {option.description}
                </CardDescription>
                <Button 
                  variant="outline" 
                  className="mt-4 w-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(option.href);
                  }}
                >
                  Open
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}