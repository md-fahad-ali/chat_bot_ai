import requests
r = requests.post("https://graph.facebook.com/me/subscribed_apps?access_token=EAAdOeVowZBNIBO8vQJ4JyMTUj1BDiD4pEhRc2ltJC6KB8HVkJP0RtAr3bUeZAVHO3RuFNxzgoIVFqd95xyz69BpLCIesdVmocx6EyUOtH6IuLIZBKtAU4Xu8rHX0aL2z7AQ0wU67YWLeArKwg5k4seo6EMqZAlyI5MSFkNp7nDQFbB1gnUJqV40PZCLABSwRIAqsY5fvlqfBt04d9rhrYZCFVK", json={"subscribed_fields": ["messages", "messaging_postbacks", "messaging_referrals"]})
response = r.json()
if "success" in response:
    if response["success"] == True:
       print("Webhook subscriptions renewed")
