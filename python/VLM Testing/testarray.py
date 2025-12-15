# flake8: noqa
import generictester
import csv


token = "Bearer "+"eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6InZUdzF6bi02cjFPcXg0NmNxRl9PMiJ9.eyJodHRwczovL2lkZW50LmV5ZXBvcC5haS9lbWFpbCI6ImFuZHlAZXllcG9wLmFpIiwiaHR0cHM6Ly9pZGVudC5leWVwb3AuYWkvYXV0aC1wcm92aWRlci1pZCI6ImF1dGgwfDY0YzQyYWI5ODc0ZGU3OGQyZTlmM2U0YSIsImh0dHBzOi8vaWRlbnQuZXllcG9wLmFpL3VzZXItdXVpZCI6ImZmOTFkNDYxNDYwZjExZWY4YTgyMGEzNTlhZTBiYjlkIiwiaHR0cHM6Ly9jbGFpbXMuZXllcG9wLmFpL2dyYW50cyI6W3sicGVybWlzc2lvbiI6ImFjY2VzczppbmZlcmVuY2UtYXBpIiwidGFyZ2V0IjoidXNlcjphdXRoMHw2NGM0MmFiOTg3NGRlNzhkMmU5ZjNlNGEifSx7InBlcm1pc3Npb24iOiJ1c2VyOmNvbXB1dGUiLCJ0YXJnZXQiOiJhY2NvdW50OjQ5MzI2ZjJlMDg1YTQ2YzM5YmE3M2Y5MWM1MmU0MzZjIn0seyJwZXJtaXNzaW9uIjoidXNlcjpjb21wdXRlIiwidGFyZ2V0IjoiYWNjb3VudDpiNDk2N2ZkY2M3ZWU0ZGYxYTA2YjM3NTU2ZGQyMWM2ZSJ9LHsicGVybWlzc2lvbiI6ImFjY2VzczpkYXRhc2V0cyIsInRhcmdldCI6ImFjY291bnQ6NDkzMjZmMmUwODVhNDZjMzliYTczZjkxYzUyZTQzNmMifSx7InBlcm1pc3Npb24iOiJhY2Nlc3M6ZGF0YXNldHMiLCJ0YXJnZXQiOiJhY2NvdW50OmI0OTY3ZmRjYzdlZTRkZjFhMDZiMzc1NTZkZDIxYzZlIn1dLCJodHRwczovL2NsYWltcy5leWVwb3AueHl6L2dyb3VwcyI6WyJSZWdpc3RyeVVzZXIiXSwiaHR0cHM6Ly9zdGFnaW5nLmV5ZXBvcC54eXovZ3JvdXBzIjpbIlJlZ2lzdHJ5VXNlciJdLCJpc3MiOiJodHRwczovL2F1dGgwLmV5ZXBvcC54eXovIiwic3ViIjoiYXV0aDB8NjRjNDJhYjk4NzRkZTc4ZDJlOWYzZTRhIiwiYXVkIjoiaHR0cHM6Ly9kZXYtYXBwLmV5ZXBvcC5haSIsImlhdCI6MTc2NTgyMjIxNSwiZXhwIjoxNzY1ODI5NDE1LCJzY29wZSI6ImFjY2VzczpkYXRhc2V0cyB1c2VyOmNvbXB1dGUiLCJhenAiOiJJVXQwcHMybWFXWlVkRW1FT1BSYVBKS3ZrUVRzNllVRSIsInBlcm1pc3Npb25zIjpbImFjY2VzczpkYXRhc2V0cyIsImFjY2VzczppbmZlcmVuY2UtYXBpIiwiYWRtaW46YXJnb2NkIiwiYWRtaW46Y2xvdWQtaW5zdGFuY2VzIiwiYWRtaW46Y2xvdWRzIiwicmVhZDptb2RlbC11cmxzIiwicmVhZDpyZWdpc3RyeSIsInVzZXI6Y29tcHV0ZSJdfQ.cAaq1fnc-b0ebCqjiNkXwHa6ZLwoHCArW3DwMHzbC1DVqkYGh812i0aK-d4l32QCuGPvnYKEtVIsTdv91T3RBRguuNVZCXDwspkoU1-fHS7iLFaBDpF8rTVTKm_q41DQTgUw_Y1J0sVt4A5yIk1bCjQe9q3PBT2EQzaTNA4W8bji5_nnNYJBN81YzBVGyG9x8PZDuMz0dAIC_MJh1AU-a_NjkGWPiUUxAlBAdrRf3S2aBjGumh3Qw1c1bvOmXknfN6yzM3JEYZTaghtfYgv_O6rBTmJuMD__eJm2-i-nXE_E_eezNKB9efYKmlOvovTNBoE8WP_BcWr3wZEOm1PEPw"

with open('testarray.csv', newline='') as csvfile:
    reader = csv.DictReader(csvfile)
    for row in reader:
        print(row)
        tag = row['tag']
        text_prompt = row['prompt']
        worker_release = row['model']
        image_folder_path = row['folder']
        samples = int(row['samples'])
        expected_result = row['expected']
        run = row['run']

        if(run=='x'):
            continue
    
        generictester.TestPrompt(
            tag,
            text_prompt,
            image_folder_path,
            token,
            worker_release=worker_release,
            sample_size=samples,
            expected_result=expected_result
        )
        # break