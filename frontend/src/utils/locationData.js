export const countries = [
  'India', 'United States', 'United Kingdom', 'Canada', 'Australia',
  'UAE', 'Singapore', 'Germany', 'France', 'Other'
]

export const statesByCountry = {
  'India': [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
    'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
    'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
    'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
    'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
    'Delhi', 'Jammu & Kashmir', 'Ladakh', 'Puducherry', 'Chandigarh'
  ],
  'United States': [
    'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado',
    'Connecticut', 'Florida', 'Georgia', 'Hawaii', 'Illinois', 'New York',
    'Texas', 'Washington', 'Other'
  ],
  'United Kingdom': ['England', 'Scotland', 'Wales', 'Northern Ireland'],
  'Canada': ['Ontario', 'Quebec', 'British Columbia', 'Alberta', 'Other'],
  'Australia': ['New South Wales', 'Victoria', 'Queensland', 'Other'],
  'UAE': ['Abu Dhabi', 'Dubai', 'Sharjah', 'Other'],
  'Singapore': ['Singapore'],
  'Germany': ['Bavaria', 'Berlin', 'Hamburg', 'Other'],
  'France': ['Île-de-France', 'Other'],
  'Other': ['Other']
}

export const citiesByState = {
  'Tamil Nadu': ['Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem', 'Tirunelveli', 'Vellore', 'Erode', 'Thanjavur', 'Tiruppur', 'Other'],
  'Karnataka': ['Bengaluru', 'Mysuru', 'Hubli', 'Mangaluru', 'Belgaum', 'Other'],
  'Maharashtra': ['Mumbai', 'Pune', 'Nagpur', 'Nashik', 'Aurangabad', 'Other'],
  'Andhra Pradesh': ['Visakhapatnam', 'Vijayawada', 'Guntur', 'Nellore', 'Kurnool', 'Other'],
  'Telangana': ['Hyderabad', 'Warangal', 'Nizamabad', 'Other'],
  'Kerala': ['Thiruvananthapuram', 'Kochi', 'Kozhikode', 'Thrissur', 'Other'],
  'Delhi': ['New Delhi', 'North Delhi', 'South Delhi', 'East Delhi', 'West Delhi', 'Other'],
  'Gujarat': ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Other'],
  'Rajasthan': ['Jaipur', 'Jodhpur', 'Udaipur', 'Kota', 'Other'],
  'Uttar Pradesh': ['Lucknow', 'Kanpur', 'Agra', 'Varanasi', 'Noida', 'Other'],
  'West Bengal': ['Kolkata', 'Howrah', 'Durgapur', 'Other'],
  'Punjab': ['Chandigarh', 'Ludhiana', 'Amritsar', 'Jalandhar', 'Other'],
  'Haryana': ['Gurugram', 'Faridabad', 'Panipat', 'Rohtak', 'Other'],
  'Madhya Pradesh': ['Bhopal', 'Indore', 'Jabalpur', 'Gwalior', 'Other'],
  'Bihar': ['Patna', 'Gaya', 'Muzaffarpur', 'Other'],
  'Other': ['Other']
}

export function getCities(state) {
  return citiesByState[state] || ['Other']
}

export const branchesByCourse = {
  'BE': ['Computer Science', 'Information Technology', 'Electronics & Communication', 'Electrical Engineering', 'Mechanical Engineering', 'Civil Engineering', 'Chemical Engineering', 'Biotechnology', 'Others'],
  'MBA': ['Finance', 'Marketing', 'Human Resources', 'Operations', 'Business Analytics', 'International Business', 'Others'],
  'BCOM': ['General', 'Accounting', 'Finance', 'Computer Applications', 'Others'],
  'MCOM': ['Finance & Taxation', 'Accounting', 'Business Administration', 'Others'],
  'Others': ['Others']
}
